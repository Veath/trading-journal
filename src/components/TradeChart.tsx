import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  type AutoscaleInfo,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Trade } from '../types'
import { chartSidecar } from '../lib/load'
import { baseChartOptions, candleColors, themeColors, usePrefersDark } from '../lib/chartTheme'
import { Overlay } from '../lib/chartOverlay'
import {
  DEFAULT_TIMEFRAMES,
  INTERVALS,
  binanceSymbol,
  fetchKlines,
  indexAt,
  offsetMs,
  parseTime,
  tradeTz,
  type Candle,
  type Interval,
  type Sidecar,
} from '../lib/market'

/** 拉取的 K 线数量：入场前 / 出场后 */
const FETCH: Record<Interval, { before: number; after: number }> = {
  '1d': { before: 180, after: 20 },
  '4h': { before: 240, after: 60 },
  '1h': { before: 300, after: 72 },
  '15m': { before: 300, after: 160 },
}
/** 初始可见范围（与静态复盘图一致） */
const VIEW: Record<Interval, { before: number; after: number }> = {
  '1d': { before: 30, after: 3 },
  '4h': { before: 42, after: 6 },
  '1h': { before: 72, after: 12 },
  '15m': { before: 32, after: 32 },
}
const LIVE_REFRESH_MS = 30_000

const decimals = (n: number) => String(n).split('.')[1]?.length ?? 0

interface Props {
  trade: Trade
  /** 行情加载失败时调用（交易详情据此显示已生成的静态复盘图兜底） */
  onError?: () => void
  /** 有可用的静态复盘图时，失败提示里说明一下 */
  hasFallback?: boolean
}

export default function TradeChart({ trade, onError, hasFallback }: Props) {
  const sidecar = chartSidecar(trade.id)
  const timeframes = sidecar.timeframes ?? DEFAULT_TIMEFRAMES
  const initial = (trade.timeframe && timeframes.find((t) => t === trade.timeframe)) || timeframes[timeframes.length - 1]
  const [tab, setTab] = useState<Interval>(initial)
  const dark = usePrefersDark()
  const tz = tradeTz(trade, sidecar)

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>行情图</h2>
          <p className="sub">
            Binance 永续 {binanceSymbol(trade, sidecar)} · 时间 UTC{tz}
            {trade.status === 'open' && ' · 每 30 秒刷新'}
          </p>
        </div>
        <div className="segmented" role="group" aria-label="周期">
          {timeframes.map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {INTERVALS[t].label}
            </button>
          ))}
        </div>
      </div>
      <CandleChart key={`${tab}-${dark}`} trade={trade} sidecar={sidecar} interval={tab} onError={onError} hasFallback={hasFallback} />
    </section>
  )
}

function CandleChart({ trade, sidecar, interval, onError, hasFallback }: { trade: Trade; sidecar: Sidecar; interval: Interval } & Pick<Props, 'onError' | 'hasFallback'>) {
  const ref = useRef<HTMLDivElement>(null)
  // 回调放进 ref，避免父组件每次渲染都重建图表
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    const c = themeColors()
    const symbol = binanceSymbol(trade, sidecar)
    const tz = tradeTz(trade, sidecar)
    const shift = offsetMs(tz)
    const { ms } = INTERVALS[interval]
    // lightweight-charts 按 UTC 显示时间，平移到交易所用时区
    const toTime = (t: number) => Math.floor((t + shift) / 1000) as UTCTimestamp

    const base = baseChartOptions(c)
    const chart = createChart(el, {
      ...base,
      timeScale: { ...base.timeScale, timeVisible: interval !== '1d', secondsVisible: false },
      localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' },
    })
    const series = chart.addSeries(CandlestickSeries, {
      ...candleColors(c),
      // 最新价线和止损 / 目标线同色，已平仓的交易不显示，免得混淆
      priceLineVisible: trade.status === 'open',
      // 纵轴始终包含入场 / 止损 / 目标，方便看 R:R
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const info = base()
        const levels = [trade.entry, trade.stop, trade.target].filter((v): v is number => v != null)
        if (!info?.priceRange || !levels.length) return info
        const { minValue, maxValue } = info.priceRange
        return { ...info, priceRange: { minValue: Math.min(minValue, ...levels), maxValue: Math.max(maxValue, ...levels) } }
      },
    })

    if (!trade.time) {
      setLoading(false)
      setError('交易缺少 time 字段，无法定位入场 K 线')
      return () => chart.remove()
    }
    const entryMs = parseTime(`${trade.date} ${trade.time}`, tz)
    const exitMs = sidecar.exitTime ? parseTime(sidecar.exitTime, tz) : undefined
    const now = Date.now()
    const start = entryMs - FETCH[interval].before * ms
    const end = Math.min(now, (exitMs ?? now) + FETCH[interval].after * ms)

    const draw = (candles: Candle[]) => {
      const precision = Math.min(4, Math.max(...candles.slice(-50).map((k) => decimals(k.close))))
      series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
      series.setData(candles.map((k) => ({ time: toTime(k.t), open: k.open, high: k.high, low: k.low, close: k.close })))

      const idx = (s: string) => indexAt(candles, parseTime(s, tz), ms)
      const at = (s: string) => toTime(candles[idx(s)].t)
      const entryTime = toTime(candles[indexAt(candles, entryMs, ms)].t)

      // 入场 / 止损 / 目标 / 出场：横贯全图的价格线，右侧坐标轴有价格标签
      const priceLine = (price: number | undefined, title: string, color: string, lineStyle: LineStyle) =>
        price != null && series.createPriceLine({ price, title, color, lineStyle, lineWidth: 1, axisLabelVisible: true })
      priceLine(trade.target, '目标', c.bull, LineStyle.Dashed)
      priceLine(trade.stop, '止损', c.bear, LineStyle.Dashed)
      priceLine(trade.entry, '入场', c.accent, LineStyle.Solid)
      priceLine(trade.exit, '出场', c.text2, LineStyle.Dotted)

      const short = trade.direction === 'short'
      const markers: SeriesMarker<Time>[] = [
        { time: entryTime, position: short ? 'aboveBar' : 'belowBar', shape: short ? 'arrowDown' : 'arrowUp', color: c.accent, text: '入场' },
      ]
      if (exitMs != null) {
        const time = toTime(candles[indexAt(candles, exitMs, ms)].t)
        // 有出场价时画在出场价上，小圆点不遮住整根 K 线
        markers.push(trade.exit != null
          ? { time, position: 'atPriceMiddle', price: trade.exit, shape: 'circle', color: c.text2, text: '出场', size: 0.6 }
          : { time, position: 'inBar', shape: 'circle', color: c.text2, text: '出场', size: 0.6 })
      }
      const spec = sidecar.intervals?.[interval] ?? {}
      for (const m of spec.marks ?? []) {
        const above = m.pos === 'above'
        markers.push({ time: at(m.at), position: above ? 'aboveBar' : 'belowBar', shape: above ? 'arrowDown' : 'arrowUp', color: c.text2, text: m.text })
      }
      createSeriesMarkers(series, markers.sort((a, b) => (a.time as number) - (b.time as number)))

      const zoneColor = { bull: c.bull, bear: c.bear, neutral: c.muted, accent: c.accent }
      const lineColor = { neutral: c.text2, stop: c.bear, target: c.bull, entry: c.accent }
      series.attachPrimitive(
        new Overlay(
          {
            zones: (spec.zones ?? []).map((z) => ({ ...z, from: idx(z.from), to: z.to ? idx(z.to) : undefined, color: zoneColor[z.kind] })),
            lines: (spec.lines ?? []).map((l) => ({ ...l, from: idx(l.from), to: l.to ? idx(l.to) : undefined, color: lineColor[l.kind ?? 'neutral'], dash: [4, 3], width: 1 })),
          },
          { font: c.font, text: c.text, muted: c.text2, halo: c.bg },
        ),
      )

      // 按下标设可见范围：出场后的 K 线不够时右侧留空，标注文字和价格标签不会挤在边缘
      const view = VIEW[interval]
      const entryIdx = indexAt(candles, entryMs, ms)
      const lastIdx = exitMs != null ? indexAt(candles, exitMs, ms) : candles.length - 1
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, entryIdx - view.before),
        to: Math.max(lastIdx + view.after, candles.length - 1 + 4),
      })
    }

    fetchKlines(symbol, interval, start, end)
      .then((candles) => {
        if (cancelled) return
        if (!candles.length) throw new Error(`Binance 没有 ${symbol} ${interval} 的数据`)
        draw(candles)
        setLoading(false)
        // 持仓中的交易定时更新最新 K 线
        if (trade.status === 'open') {
          timer = setInterval(async () => {
            try {
              const t = Date.now()
              for (const k of await fetchKlines(symbol, interval, t - 2 * ms, t)) {
                if (!cancelled) series.update({ time: toTime(k.t), open: k.open, high: k.high, low: k.low, close: k.close })
              }
            } catch {
              // 网络抖动时跳过本次刷新
            }
          }, LIVE_REFRESH_MS)
        }
      })
      .catch((e: Error) => {
        if (cancelled) return
        setLoading(false)
        setError(e.message)
        onErrorRef.current?.()
      })

    return () => {
      cancelled = true
      clearInterval(timer)
      chart.remove()
    }
  }, [trade, sidecar, interval])

  return (
    <div className={error ? 'trade-chart failed' : 'trade-chart'}>
      <div ref={ref} className="trade-chart-canvas" />
      {loading && <div className="trade-chart-msg">加载 K 线…</div>}
      {error && (
        <div className="trade-chart-msg">
          <p>行情加载失败：{error}</p>
          <p>
            {hasFallback
              ? '下方显示之前生成的静态复盘图。'
              : <>目前只支持 Binance USDT 永续上有的品种；交易所代码不同时，在 journal/charts/{trade.id}.json 里设置 <code>symbol</code></>}
          </p>
        </div>
      )}
    </div>
  )
}
