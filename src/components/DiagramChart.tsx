import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type AutoscaleInfo,
  type ISeriesApi,
  type LineWidth,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Diagram, Mark, Segment } from '../../scripts/diagrams/render.ts'
import { alpha, baseChartOptions, themeColors, usePrefersDark, type ChartColors } from '../lib/chartTheme'
import { Overlay, type OverlaySegment, type OverlayStyle, type OverlayTag } from '../lib/chartOverlay'

// 示意图没有真实时间：第 i 根 K 线放在 BASE + i 天，时间轴隐藏，十字光标显示「第 n 根」
const BASE = 1_700_000_000
const DAY = 86_400
const toTime = (i: number) => (BASE + i * DAY) as UTCTimestamp
const toIndex = (t: Time) => Math.round(((t as number) - BASE) / DAY)

const MAIN_H = 320
const PANEL_H = 150

const decimals = (n: number) => String(n).split('.')[1]?.length ?? 0

/** 估算 11px 粗体标签宽度：全角字符 11px，其余 6.5px */
const textWidth = (s: string) => [...s].reduce((w, ch) => w + (/[\u2E80-\uFFEF]/.test(ch) ? 11 : 6.5), 0)

/** 与 render.ts 的配色对应 */
function palette(c: ChartColors) {
  return {
    line: { neutral: c.muted, stop: c.down, target: c.up, entry: c.accent },
    lineDash: { neutral: [4, 3], stop: [6, 3], target: [6, 3], entry: [] as number[] },
    zone: { bull: c.up, bear: c.down, neutral: c.text2, accent: c.accent },
    series: { main: c.accent, band: c.muted, ema1: c.accent, ema2: c.ema2, ema3: c.ema3, ema4: c.text2 },
    seg: { accent: c.accent, neutral: c.muted, bull: c.up, bear: c.down },
  }
}

function toSegment(s: Segment, p: ReturnType<typeof palette>): OverlaySegment {
  const kind = s.kind ?? 'accent'
  return {
    from: s.from,
    to: s.to,
    label: s.label,
    labelPos: s.labelPos,
    color: p.seg[kind],
    dots: kind === 'accent',
    width: kind === 'accent' ? 2 : kind === 'neutral' ? 1.2 : 1.8,
    dash: kind === 'neutral' ? [5, 3] : undefined,
  }
}

function toMarkers(marks: Mark[] | undefined, color: string): SeriesMarker<Time>[] {
  return (marks ?? [])
    .map((m) => ({
      time: toTime(m.at),
      position: m.pos === 'above' ? ('aboveBar' as const) : ('belowBar' as const),
      shape: m.pos === 'above' ? ('arrowDown' as const) : ('arrowUp' as const),
      color,
      text: m.text,
    }))
    .sort((a, b) => (a.time as number) - (b.time as number))
}

/** 与 candles 对齐的数值 → 折线 / 柱数据，null 处留空 */
const points = (values: (number | null)[]) =>
  values.map((v, i) => (v == null || Number.isNaN(v) ? { time: toTime(i) } : { time: toTime(i), value: v }))

export default function DiagramChart({ diagram: d }: { diagram: Diagram }) {
  const ref = useRef<HTMLDivElement>(null)
  const dark = usePrefersDark()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const c = themeColors()
    const p = palette(c)
    const n = d.candles.length
    const style: OverlayStyle = { font: c.font, text: c.text, muted: c.text2, halo: c.surface, end: n - 1 }
    const base = baseChartOptions(c)

    const chart = createChart(el, {
      ...base,
      timeScale: { ...base.timeScale, visible: false },
      localization: { timeFormatter: (t: Time) => `第 ${toIndex(t) + 1} 根` },
      crosshair: { horzLine: { labelVisible: true } },
      // 不劫持页面滚动：滚轮照常滚动笔记，拖动 / 双指缩放查看细节
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    })

    // —— 价格区 ——
    const extra = [
      ...(d.zones ?? []).flatMap((z) => [z.top, z.bottom]),
      ...(d.lines ?? []).map((l) => l.y),
      ...(d.segments ?? []).flatMap((s) => [s.from[1], s.to[1]]),
      ...(d.profile?.rows ?? []).flatMap((r) => [r.lo, r.hi]),
    ]
    const allPrices = [...d.candles.flatMap((k) => (k ? [k[1], k[2]] : [])), ...extra]
    const precision = Math.min(4, Math.max(0, ...allPrices.map(decimals)))
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      borderUpColor: c.up,
      borderDownColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
      // 纵轴包含所有标注，和静态图的取值范围一致
      autoscaleInfoProvider: (orig: () => AutoscaleInfo | null) => {
        const info = orig()
        if (!info?.priceRange || !extra.length) return info
        const { minValue, maxValue } = info.priceRange
        return { ...info, priceRange: { minValue: Math.min(minValue, ...extra), maxValue: Math.max(maxValue, ...extra) } }
      },
    })
    candles.priceScale().applyOptions({ scaleMargins: { top: d.spans?.length ? 0.2 : 0.12, bottom: 0.1 } })
    const data = d.candles.map((k, i) => (k ? { time: toTime(i), open: k[0], high: k[1], low: k[2], close: k[3] } : { time: toTime(i) }))
    // 右侧放大的汇总 K 线（如日线），隔一格放在后面
    if (d.big) {
      const [o, h, l, cl] = d.big.ohlc
      data.push({ time: toTime(n) }, { time: toTime(n + 1), open: o, high: h, low: l, close: cl }, { time: toTime(n + 2) })
    }
    candles.setData(data)

    const markers = toMarkers(d.marks, c.accent)
    if (d.big) markers.push({ time: toTime(n + 1), position: 'belowBar', shape: 'square', color: c.muted, text: d.big.label, size: 0 })
    createSeriesMarkers(candles, markers)

    // 延伸到右边缘的线 / 区域：名称画成右侧标签，价格显示在坐标轴上
    const axisPrice = (series: ISeriesApi<SeriesType>, price: number, color: string) =>
      series.createPriceLine({ price, color, lineVisible: false, axisLabelVisible: true, axisLabelColor: color, axisLabelTextColor: c.surface })
    const tags: OverlayTag[] = []
    for (const z of d.zones ?? []) if (z.to == null && z.label) tags.push({ price: (z.top + z.bottom) / 2, label: z.label, color: p.zone[z.kind] })
    for (const l of d.lines ?? []) if (l.to == null && l.label) tags.push({ price: l.y, label: l.label, color: p.line[l.kind ?? 'neutral'] })
    for (const s of d.series ?? []) {
      const last = s.values.filter((v): v is number => v != null && !Number.isNaN(v)).at(-1)
      if (s.label && last != null) tags.push({ price: last, label: s.label, color: p.series[s.kind] })
    }
    for (const t of tags) axisPrice(candles, t.price, t.color)

    for (const s of d.series ?? []) {
      const line = chart.addSeries(LineSeries, {
        color: p.series[s.kind],
        lineWidth: (s.kind === 'ema4' ? 3 : s.kind === 'band' ? 1 : 2) as LineWidth,
        lineStyle: s.kind === 'band' ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      line.setData(points(s.values))
    }

    candles.attachPrimitive(
      new Overlay(
        {
          tags,
          // 延伸到右边缘的区域 / 线，名称已经画成右侧标签（tags）
          zones: (d.zones ?? []).map((z) => ({ ...z, label: z.to == null ? undefined : z.label, color: p.zone[z.kind], dashed: z.kind === 'neutral' })),
          lines: (d.lines ?? []).map((l) => ({ ...l, label: l.to == null ? undefined : l.label, color: p.line[l.kind ?? 'neutral'], dash: p.lineDash[l.kind ?? 'neutral'] })),
          segments: (d.segments ?? []).map((s) => toSegment(s, p)),
          spans: d.spans,
          vlines: (d.vlines ?? []).map((v) => ({ at: v.at, label: d.panel ? undefined : v.label, color: v.kind === 'accent' ? c.accent : c.muted, width: v.kind === 'accent' ? 1.4 : 1 })),
          profile: d.profile && {
            ...d.profile,
            colors: { row: alpha(c.text2, 0.16), va: alpha(c.up, 0.24), poc: alpha(c.accent, 0.55) },
          },
        },
        style,
      ),
    )

    // —— 副图（RSI / MACD / 成交量 / 量能曲线） ——
    const panel = d.panel
    const panelTags: OverlayTag[] = (panel?.levels ?? []).flatMap((l) => (l.label ? [{ price: l.y, label: l.label, color: c.muted }] : []))
    if (panel?.band) panelTags.push({ price: (panel.band.top + panel.band.bottom) / 2, label: panel.band.label, color: c.up })
    if (panel) {
      const fixed = (): AutoscaleInfo => ({ priceRange: { minValue: panel.min, maxValue: panel.max } })
      const common = { priceLineVisible: false, lastValueVisible: false, autoscaleInfoProvider: fixed }
      const added: ISeriesApi<SeriesType>[] = []
      if (panel.histogram) {
        const h = chart.addSeries(HistogramSeries, { ...common, base: 0 }, 1)
        h.setData(panel.histogram.map((v, i) => (v == null || Number.isNaN(v) ? { time: toTime(i) } : { time: toTime(i), value: v, color: alpha(v >= 0 ? c.up : c.down, 0.45) })))
        added.push(h)
      }
      if (panel.volume) {
        const h = chart.addSeries(HistogramSeries, { ...common, base: 0 }, 1)
        h.setData(panel.volume.map((v, i) => {
          const k = d.candles[i]
          return k ? { time: toTime(i), value: v, color: alpha(k[3] >= k[0] ? c.up : c.down, 0.45) } : { time: toTime(i) }
        }))
        added.push(h)
      }
      for (const cv of panel.curves ?? []) {
        const l = chart.addSeries(LineSeries, { ...common, color: cv.kind === 'bull' ? c.up : c.down, lineWidth: 2, crosshairMarkerVisible: false }, 1)
        l.setData(points(cv.values))
        added.push(l)
      }
      let valuesSeries: ISeriesApi<SeriesType> | undefined
      if (panel.values) {
        valuesSeries = chart.addSeries(LineSeries, { ...common, color: c.text2, lineWidth: 2, crosshairMarkerVisible: false }, 1)
        valuesSeries.setData(points(panel.values))
        added.push(valuesSeries)
      }
      if (panel.signal) {
        const l = chart.addSeries(LineSeries, { ...common, color: c.accent, lineWidth: 1, crosshairMarkerVisible: false }, 1)
        l.setData(points(panel.signal))
        added.push(l)
      }
      const primary = valuesSeries ?? added[0]
      if (primary) {
        for (const l of panel.levels ?? []) {
          primary.createPriceLine({ price: l.y, color: c.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true })
        }
        primary.attachPrimitive(
          new Overlay(
            {
              tags: panelTags,
              caption: panel.title,
              zones: panel.band ? [{ from: 0, top: panel.band.top, bottom: panel.band.bottom, color: c.up }] : undefined,
              segments: (panel.segments ?? []).map((s) => toSegment(s, p)),
              vlines: (d.vlines ?? []).map((v) => ({ at: v.at, label: v.label, color: v.kind === 'accent' ? c.accent : c.muted, width: v.kind === 'accent' ? 1.4 : 1 })),
            },
            style,
          ),
        )
        createSeriesMarkers(primary, toMarkers(panel.marks, c.accent))
      }
      // 留出副图标题和标注箭头的位置（取值范围固定，箭头不会自动撑开留白）
      const has = (pos: Mark['pos']) => panel.marks?.some((m) => m.pos === pos)
      primary?.priceScale().applyOptions({ scaleMargins: { top: has('above') ? 0.32 : 0.22, bottom: has('below') ? 0.3 : 0.08 } })
      chart.panes()[1]?.setHeight(PANEL_H)
    }

    // 右侧留出标签的宽度，避免盖住最后几根 K 线：off 根空位占宽 ≥ 标签宽，off ≥ tagW·bars / (W − tagW)
    const tagW = Math.max(0, ...[...tags, ...panelTags].map((t) => textWidth(t.label) + 24))
    const bars = data.length
    const plotW = el.clientWidth - 56 // 减去右侧价格轴的大致宽度
    const off = tagW && plotW > tagW ? Math.ceil((tagW * bars) / (plotW - tagW)) : 0
    chart.timeScale().applyOptions({ rightOffset: Math.max(1, off) })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [d, dark])

  return (
    <figure className="diagram">
      <figcaption>{d.title}</figcaption>
      <div ref={ref} className="diagram-canvas" style={{ height: MAIN_H + (d.panel ? PANEL_H : 0) }} />
    </figure>
  )
}
