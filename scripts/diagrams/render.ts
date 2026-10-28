// 把「K 线数据 + 标注」渲染成 SVG 示意图。
// 颜色与仪表盘一致：上涨蓝、下跌红；内嵌 prefers-color-scheme，浅色 / 深色模式都可读。
// 延伸到右边缘的线 / 区域，标签放在右侧标签栏（类似价格轴标签），并自动错开避免重叠；
// 有终点（to）的线段和区域，标签放在起点上方。

export type OHLC = [open: number, high: number, low: number, close: number]

export interface Zone {
  from: number // 起始 K 线下标
  to?: number // 结束 K 线下标，省略则延伸到右边缘
  top: number
  bottom: number
  label?: string
  kind: 'bull' | 'bear' | 'neutral' | 'accent'
}

export interface Line {
  from: number
  to?: number
  y: number
  label?: string
  kind?: 'neutral' | 'stop' | 'target' | 'entry'
  labelFrom?: number // 线段标签的起始 K 线下标，默认为 from（避开 K 线遮挡时使用）
}

export interface Mark {
  at: number
  text: string
  pos: 'above' | 'below'
}

export interface Span {
  from: number
  to: number
  label: string
}

export interface Diagram {
  file: string // 输出文件名（不含扩展名）
  title: string
  candles: (OHLC | null)[] // null = 空位
  zones?: Zone[]
  lines?: Line[]
  marks?: Mark[]
  spans?: Span[] // 顶部括号，用于标注阶段
  big?: { ohlc: OHLC; label: string } // 右侧放大的汇总 K 线（如日线）
  // —— 以下用于真实行情图（交易复盘），示意图不需要 ——
  step?: number // 每根 K 线占宽，默认 26；K 线多时调小
  xLabels?: { at: number; text: string }[] // 底部时间轴标签
  yAxis?: boolean // 左侧价格刻度
}

const DEFAULT_STEP = 26 // 每根 K 线占宽
const DEFAULT_PAD = { left: 16, right: 16, top: 70, bottom: 40 }
const PLOT_H = 260
const GUTTER_GAP = 14 // K 线区与右侧标签栏的间距
const LABEL_MIN_GAP = 16 // 右侧标签之间的最小纵向间距

/** 整齐的价格刻度 */
function niceTicks(min: number, max: number, count = 5): number[] {
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw)!
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v)
  return ticks
}

/** 估算 12px 文本宽度：全角字符 12px，其余 7px */
function textWidth(s: string, size = 12): number {
  let w = 0
  for (const ch of s) w += /[\u2E80-\uFFEF]/.test(ch) ? size : size * 0.58
  return w
}

/** 让一组标签在纵向上至少相隔 LABEL_MIN_GAP，尽量贴近原位置 */
function spreadLabels(ys: number[]): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  for (let k = 1; k < order.length; k++) {
    order[k].y = Math.max(order[k].y, order[k - 1].y + LABEL_MIN_GAP)
  }
  const out: number[] = []
  for (const o of order) out[o.i] = o.y
  return out
}

const STYLE = `
  .bg { fill: #fcfcfb; }
  .title { fill: #0b0b0b; font-weight: 600; font-size: 14px; }
  text { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 12px; fill: #0b0b0b; paint-order: stroke; stroke: #fcfcfb; stroke-width: 3px; stroke-linejoin: round; }
  .muted { fill: #52514e; }
  .wick { stroke-width: 1.5; }
  .up { fill: #2a78d6; stroke: #2a78d6; }
  .down { fill: #e34948; stroke: #e34948; }
  .z-bull { fill: rgba(42, 120, 214, 0.14); stroke: rgba(42, 120, 214, 0.5); }
  .z-bear { fill: rgba(227, 73, 72, 0.12); stroke: rgba(227, 73, 72, 0.5); }
  .z-neutral { fill: rgba(120, 120, 115, 0.10); stroke: none; }
  .z-accent { fill: rgba(237, 161, 0, 0.22); stroke: rgba(201, 133, 0, 0.8); }
  .l-neutral { stroke: #52514e; stroke-dasharray: 4 3; }
  .l-stop { stroke: #e34948; stroke-dasharray: 6 3; }
  .l-target { stroke: #2a78d6; stroke-dasharray: 6 3; }
  .l-entry { stroke: #0b0b0b; }
  .bracket { stroke: #52514e; fill: none; }
  .grid { stroke: #ecebe7; }
  .tick { font-size: 11px; fill: #8a8984; stroke: none; }
  .arrow { fill: #52514e; stroke: none; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #1a1a19; }
    .title, text { fill: #f0efec; }
    text { stroke: #1a1a19; }
    .muted { fill: #c3c2b7; }
    .up { fill: #3987e5; stroke: #3987e5; }
    .down { fill: #e66767; stroke: #e66767; }
    .l-neutral, .bracket { stroke: #c3c2b7; }
    .grid { stroke: #2a2a28; }
    .tick { fill: #8a8984; }
    .l-entry { stroke: #f0efec; }
    .arrow { fill: #c3c2b7; }
  }
`

const r1 = (n: number) => Math.round(n * 10) / 10
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export function render(d: Diagram): string {
  const STEP = d.step ?? DEFAULT_STEP
  const BODY = Math.max(3, Math.round(STEP * 0.54))
  const PAD = {
    ...DEFAULT_PAD,
    left: d.yAxis ? 60 : DEFAULT_PAD.left,
    bottom: d.xLabels ? DEFAULT_PAD.bottom + 18 : DEFAULT_PAD.bottom,
  }
  const n = d.candles.length + (d.big ? 3 : 0)
  const gutterLabels = [
    ...(d.zones ?? []).filter((z) => z.to == null && z.label).map((z) => ({ label: z.label!, price: (z.top + z.bottom) / 2 })),
    ...(d.lines ?? []).filter((l) => l.to == null && l.label).map((l) => ({ label: l.label!, price: l.y })),
  ]
  const gutterW = gutterLabels.length ? GUTTER_GAP + Math.max(...gutterLabels.map((g) => textWidth(g.label))) : 0
  const plotRight = PAD.left + n * STEP
  const width = Math.ceil(Math.max(plotRight + gutterW, DEFAULT_PAD.left + textWidth(d.title, 14)) + PAD.right)
  const height = PAD.top + PLOT_H + PAD.bottom

  const prices = [
    ...d.candles.flatMap((c) => (c ? [c[1], c[2]] : [])),
    ...(d.zones ?? []).flatMap((z) => [z.top, z.bottom]),
    ...(d.lines ?? []).map((l) => l.y),
    ...(d.big ? [d.big.ohlc[1], d.big.ohlc[2]] : []),
  ]
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const y = (p: number) => r1(PAD.top + ((hi - p) / (hi - lo)) * PLOT_H)
  const x = (i: number) => r1(PAD.left + STEP * (i + 0.5))
  const xEnd = PAD.left + STEP * d.candles.length
  const zoneX2 = (to?: number) => (to == null ? xEnd : x(to) + STEP / 2)
  const lineX2 = (to?: number) => (to == null ? xEnd : x(to))

  const out: string[] = []
  out.push(`<rect class="bg" width="${width}" height="${height}" rx="10"/>`)
  out.push(`<text class="title" x="${DEFAULT_PAD.left}" y="26">${esc(d.title)}</text>`)

  if (d.yAxis) {
    for (const t of niceTicks(lo, hi)) {
      out.push(`<line class="grid" x1="${PAD.left}" x2="${xEnd}" y1="${y(t)}" y2="${y(t)}"/>`)
      out.push(`<text class="tick" x="${PAD.left - 6}" y="${y(t)}" dy="0.35em" text-anchor="end">${t}</text>`)
    }
  }
  for (const xl of d.xLabels ?? []) {
    out.push(`<text class="tick" x="${x(xl.at)}" y="${height - 10}" text-anchor="middle">${esc(xl.text)}</text>`)
  }

  for (const z of d.zones ?? []) {
    const x1 = x(z.from) - STEP / 2
    out.push(
      `<rect class="z-${z.kind}" x="${x1}" y="${y(z.top)}" width="${r1(zoneX2(z.to) - x1)}" height="${r1(y(z.bottom) - y(z.top))}"/>`,
    )
  }

  for (const s of d.spans ?? []) {
    const x1 = x(s.from) - STEP / 2 + 3
    const x2 = x(s.to) + STEP / 2 - 3
    const by = PAD.top - 18
    out.push(`<path class="bracket" d="M${x1},${by + 6} V${by} H${x2} V${by + 6}"/>`)
    out.push(`<text class="muted" x="${r1((x1 + x2) / 2)}" y="${by - 6}" text-anchor="middle">${esc(s.label)}</text>`)
  }

  const drawCandle = (cx: number, [o, h, l, c]: OHLC, bodyW = BODY) => {
    const cls = c >= o ? 'up' : 'down'
    const top = y(Math.max(o, c))
    const bh = Math.max(1.5, y(Math.min(o, c)) - top)
    out.push(`<line class="wick ${cls}" x1="${cx}" x2="${cx}" y1="${y(h)}" y2="${y(l)}"/>`)
    out.push(`<rect class="${cls}" x="${r1(cx - bodyW / 2)}" y="${top}" width="${bodyW}" height="${r1(bh)}" rx="1.5"/>`)
  }

  d.candles.forEach((c, i) => c && drawCandle(x(i), c))

  if (d.big) {
    const cx = x(d.candles.length + 1.5)
    drawCandle(cx, d.big.ohlc, BODY * 2.4)
    out.push(`<text class="muted" x="${cx}" y="${y(d.big.ohlc[2]) + 20}" text-anchor="middle">${esc(d.big.label)}</text>`)
  }

  for (const l of d.lines ?? []) {
    const x1 = x(l.from)
    const x2 = lineX2(l.to)
    out.push(`<line class="l-${l.kind ?? 'neutral'}" x1="${x1}" x2="${x2}" y1="${y(l.y)}" y2="${y(l.y)}" stroke-width="1.5"/>`)
    if (l.label && l.to != null) out.push(`<text x="${(l.labelFrom == null ? x1 : x(l.labelFrom)) + 2}" y="${y(l.y) - 5}">${esc(l.label)}</text>`)
  }

  for (const z of d.zones ?? []) {
    if (z.label && z.to != null) out.push(`<text class="muted" x="${x(z.from) - STEP / 2 + 6}" y="${y(z.top) + 14}">${esc(z.label)}</text>`)
  }

  const gutterYs = spreadLabels(gutterLabels.map((g) => y(g.price)))
  gutterLabels.forEach((g, i) => {
    const gy = gutterYs[i]
    const lineY = y(g.price)
    const gx = xEnd + GUTTER_GAP
    if (Math.abs(gy - lineY) > 2) out.push(`<path class="bracket" d="M${xEnd + 2},${lineY} L${gx - 3},${gy}"/>`)
    out.push(`<text x="${gx}" y="${gy}" dy="0.35em">${esc(g.label)}</text>`)
  })

  for (const m of d.marks ?? []) {
    const c = d.candles[m.at]
    if (!c) continue
    const cx = x(m.at)
    if (m.pos === 'above') {
      const ty = y(c[1]) - 6
      out.push(`<path class="arrow" d="M${cx},${ty} l-4,-6 h8 z"/>`)
      out.push(`<text x="${cx}" y="${ty - 10}" text-anchor="middle">${esc(m.text)}</text>`)
    } else {
      const ty = y(c[2]) + 6
      out.push(`<path class="arrow" d="M${cx},${ty} l-4,6 h8 z"/>`)
      out.push(`<text x="${cx}" y="${ty + 20}" text-anchor="middle">${esc(m.text)}</text>`)
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(d.title)}">`,
    `<style>${STYLE}</style>`,
    ...out,
    '</svg>',
    '',
  ].join('\n')
}
