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
import type { AgentBiasDay } from '../types'
import { chartSidecar } from '../lib/load'
import { baseChartOptions, candleColors, themeColors, usePrefersDark } from '../lib/chartTheme'
import { Overlay, sidecarOverlayItems } from '../lib/chartOverlay'
import { DEFAULT_TIMEFRAMES, INTERVALS, fetchKlines, indexAt, offsetMs, parseTime, type Candle, type Interval, type Sidecar } from '../lib/market'

type Watch = AgentBiasDay['watch'][number]

/** 分析时间之前拉取的 K 线数量（标注要落在这个范围内） */
const FETCH: Record<Interval, number> = { '1d': 120, '4h': 240, '1h': 300, '15m': 300 }
/** 初始显示分析时间之前多少根 */
const VIEW: Record<Interval, number> = { '1d': 60, '4h': 72, '1h': 72, '15m': 64 }
const ENTRY_ZONE_LEAD = 8
const LIVE_REFRESH_MS = 30_000

const decimals = (n: number) => String(n).split('.')[1]?.length ?? 0

export default function BiasChart({ day, watch }: { day: AgentBiasDay; watch: Watch }) {
  const sidecar = chartSidecar(`bias-${day.id}-${watch.symbol.toLowerCase()}`)
  const timeframes = sidecar.timeframes ?? DEFAULT_TIMEFRAMES
  const [tab, setTab] = useState<Interval>(timeframes[timeframes.length - 1])
  const dark = usePrefersDark()
  const tz = day.tz ?? '+08:00'
  const live = watch.status === 'watching' || watch.status === 'triggered'

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{watch.symbol} 行情图</h2>
          <p className="sub">
            Binance 永续 · 时间 UTC{tz}
            {live && ' · 每 30 秒刷新'}
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
      <CandleChart key={`${tab}-${dark}`} day={day} watch={watch} sidecar={sidecar} interval={tab} tz={tz} live={live} />
    </section>
  )
}

function CandleChart({ day, watch, sidecar, interval, tz, live }: { day: AgentBiasDay; watch: Watch; sidecar: Sidecar; interval: Interval; tz: string; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    const c = themeColors()
    const { ms } = INTERVALS[interval]
    const shift = offsetMs(tz)
    // lightweight-charts 按 UTC 显示时间，平移到分析用的时区
    const toTime = (t: number) => Math.floor((t + shift) / 1000) as UTCTimestamp

    const base = baseChartOptions(c)
    const chart = createChart(el, {
      ...base,
      timeScale: { ...base.timeScale, timeVisible: interval !== '1d', secondsVisible: false },
      localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' },
    })
    const series = chart.addSeries(CandlestickSeries, {
      ...candleColors(c),
      priceLineVisible: live,
      // 纵轴包含进场 / 止损 / 第一目标和关键点位；更远的目标不压缩 K 线，在大周期上看
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const info = base()
        const levels = [watch.entry, watch.stop, watch.targets?.[0], watch.entryZone?.top, watch.entryZone?.bottom, ...(watch.levels ?? []).map((l) => l.price)].filter((v): v is number => v != null)
        if (!info?.priceRange || !levels.length) return info
        const { minValue, maxValue } = info.priceRange
        return { ...info, priceRange: { minValue: Math.min(minValue, ...levels), maxValue: Math.max(maxValue, ...levels) } }
      },
    })

    const analysisMs = parseTime(`${day.date} ${day.time ?? '00:00'}`, tz)

    const draw = (candles: Candle[]) => {
      const precision = Math.min(4, Math.max(...candles.slice(-50).map((k) => decimals(k.close))))
      series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
      series.setData(candles.map((k) => ({ time: toTime(k.t), open: k.open, high: k.high, low: k.low, close: k.close })))

      const priceLine = (price: number | undefined, title: string, color: string, lineStyle: LineStyle) =>
        price != null && series.createPriceLine({ price, title, color, lineStyle, lineWidth: 1, axisLabelVisible: true })
      priceLine(watch.entry, '示例进场', c.accent, LineStyle.Solid)
      priceLine(watch.stop, '止损', c.bear, LineStyle.Dashed)
      watch.targets?.forEach((t, i) => priceLine(t, `TP${i + 1}`, c.bull, LineStyle.Dashed))
      for (const l of watch.levels ?? []) priceLine(l.price, l.label, l.kind === 'key' ? c.key : c.text2, LineStyle.Dotted)

      const idx = (s: string) => indexAt(candles, parseTime(s, tz), ms)
      const spec = sidecar.intervals?.[interval] ?? {}
      const markers: SeriesMarker<Time>[] = (spec.marks ?? []).map((m) => {
        const above = m.pos === 'above'
        return { time: toTime(candles[idx(m.at)].t), position: above ? 'aboveBar' : 'belowBar', shape: above ? 'arrowDown' : 'arrowUp', color: c.text2, text: m.text }
      })
      createSeriesMarkers(series, markers.sort((a, b) => (a.time as number) - (b.time as number)))
      const items = sidecarOverlayItems(spec, idx, c)
      // 计划进场区：从分析时间前几根开始，向右延伸到边缘，入场用蓝色
      const zone = watch.entryZone
      if (zone) {
        const from = Math.max(0, indexAt(candles, analysisMs, ms) - ENTRY_ZONE_LEAD)
        items.zones = [...(items.zones ?? []), { from, top: zone.top, bottom: zone.bottom, label: zone.label ?? '计划进场区', color: c.accent }]
      }
      series.attachPrimitive(new Overlay(items, { font: c.font, text: c.text, muted: c.text2, halo: c.bg }))

      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, indexAt(candles, analysisMs, ms) - VIEW[interval]),
        to: candles.length - 1 + 8,
      })
    }

    const now = Date.now()
    fetchKlines(watch.symbol, interval, analysisMs - FETCH[interval] * ms, now)
      .then((candles) => {
        if (cancelled) return
        if (!candles.length) throw new Error(`Binance 没有 ${watch.symbol} ${interval} 的数据`)
        draw(candles)
        setLoading(false)
        if (live) {
          timer = setInterval(async () => {
            try {
              const t = Date.now()
              for (const k of await fetchKlines(watch.symbol, interval, t - 2 * ms, t)) {
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
      })

    return () => {
      cancelled = true
      clearInterval(timer)
      chart.remove()
    }
  }, [day, watch, sidecar, interval, tz, live])

  return (
    <div className={error ? 'trade-chart failed' : 'trade-chart'}>
      <div ref={ref} className="trade-chart-canvas" />
      {loading && <div className="trade-chart-msg">加载 K 线…</div>}
      {error && (
        <div className="trade-chart-msg">
          <p>行情加载失败：{error}</p>
        </div>
      )}
    </div>
  )
}
