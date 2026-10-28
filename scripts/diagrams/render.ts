// 把「K 线数据 + 标注」渲染成 SVG 示意图。
// 风格与仪表盘一致（交易终端）：蓝墨底 + 坐标纸网格，上涨蓝、下跌红、关键位（入场）琥珀；
// 内嵌 prefers-color-scheme，浅色 / 深色模式都可读。
// 延伸到右边缘的线 / 区域，标签画成右侧价格轴标签（按类型着色），并自动错开避免重叠；
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
const LABEL_MIN_GAP = 20 // 右侧标签之间的最小纵向间距
const TAG_PAD = 6 // 价格轴标签左右内边距
const TAG_H = 18

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
  .bg { fill: url(#bg); }
  .bg-grid { stroke: rgba(28, 60, 110, 0.06); }
  .frame { fill: none; stroke: #d8dfe9; }
  .title-mark { fill: #c98500; }
  .title { fill: #111722; font-weight: 650; font-size: 14px; }
  text { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 12px; fill: #111722; paint-order: stroke; stroke: #f7f9fc; stroke-width: 3px; stroke-linejoin: round; }
  .muted { fill: #475163; }
  .wick { stroke-width: 1.5; }
  .up { fill: #2a78d6; stroke: #2a78d6; }
  .down { fill: #e34948; stroke: #e34948; }
  .z-bull { fill: rgba(42, 120, 214, 0.13); stroke: rgba(42, 120, 214, 0.55); }
  .z-bear { fill: rgba(227, 73, 72, 0.11); stroke: rgba(227, 73, 72, 0.55); }
  .z-neutral { fill: rgba(71, 81, 99, 0.09); stroke: rgba(71, 81, 99, 0.25); stroke-dasharray: 2 3; }
  .z-accent { fill: rgba(212, 145, 34, 0.18); stroke: rgba(201, 133, 0, 0.75); }
  .l-neutral { stroke: #717c8e; stroke-dasharray: 4 3; }
  .l-stop { stroke: #e34948; stroke-dasharray: 6 3; }
  .l-target { stroke: #2a78d6; stroke-dasharray: 6 3; }
  .l-entry { stroke: #c98500; }
  .bracket { stroke: #717c8e; fill: none; }
  .grid { stroke: #e4e9f0; stroke-dasharray: 2 4; }
  .tick { font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', sans-serif; font-size: 11px; fill: #717c8e; stroke: none; }
  .arrow { fill: #c98500; stroke: none; }
  .tag rect { stroke-width: 1; }
  .tag text { stroke: none; font-weight: 600; }
  .t-neutral rect { fill: rgba(71, 81, 99, 0.1); stroke: rgba(71, 81, 99, 0.4); }
  .t-neutral text { fill: #475163; }
  .t-stop rect, .t-bear rect { fill: rgba(227, 73, 72, 0.1); stroke: #e34948; }
  .t-stop text, .t-bear text { fill: #c23a3a; }
  .t-target rect, .t-bull rect { fill: rgba(42, 120, 214, 0.1); stroke: #2a78d6; }
  .t-target text, .t-bull text { fill: #1c5cab; }
  .t-entry rect, .t-accent rect { fill: rgba(212, 145, 34, 0.14); stroke: #c98500; }
  .t-entry text, .t-accent text { fill: #8a5a0e; }
  @media (prefers-color-scheme: dark) {
    .bg-grid { stroke: rgba(110, 160, 230, 0.06); }
    .frame { stroke: #1c2839; }
    .title-mark { fill: #f0b44c; }
    .title, text { fill: #e3eaf4; }
    text { stroke: #0a111d; }
    .muted { fill: #a0b0c5; }
    .up { fill: #3d8bff; stroke: #3d8bff; }
    .down { fill: #f2555f; stroke: #f2555f; }
    .candles { filter: url(#glow); }
    .z-bull { fill: rgba(61, 139, 255, 0.14); stroke: rgba(61, 139, 255, 0.6); }
    .z-bear { fill: rgba(242, 85, 95, 0.13); stroke: rgba(242, 85, 95, 0.6); }
    .z-neutral { fill: rgba(160, 176, 197, 0.08); stroke: rgba(160, 176, 197, 0.25); }
    .z-accent { fill: rgba(240, 180, 76, 0.16); stroke: rgba(240, 180, 76, 0.75); }
    .l-neutral, .bracket { stroke: #8293ab; }
    .l-stop { stroke: #f2555f; }
    .l-target { stroke: #3d8bff; }
    .l-entry { stroke: #f0b44c; }
    .grid { stroke: #182334; }
    .tick { fill: #70829b; }
    .arrow { fill: #f0b44c; }
    .t-neutral rect { fill: rgba(160, 176, 197, 0.1); stroke: rgba(160, 176, 197, 0.45); }
    .t-neutral text { fill: #c5d0de; }
    .t-stop rect, .t-bear rect { fill: rgba(242, 85, 95, 0.16); stroke: #f2555f; }
    .t-stop text, .t-bear text { fill: #ff8f98; }
    .t-target rect, .t-bull rect { fill: rgba(61, 139, 255, 0.16); stroke: #3d8bff; }
    .t-target text, .t-bull text { fill: #8cc3ff; }
    .t-entry rect, .t-accent rect { fill: rgba(240, 180, 76, 0.16); stroke: #f0b44c; }
    .t-entry text, .t-accent text { fill: #ffd38a; }
  }
`

// 背景渐变、坐标纸网格、标题下发光线、K 线辉光（仅深色模式经 CSS 启用）
const DEFS = `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f3f6fa"/></linearGradient>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3d8bff" stop-opacity="0"/><stop offset="0.3" stop-color="#3d8bff" stop-opacity="0.55"/><stop offset="1" stop-color="#3d8bff" stop-opacity="0"/></linearGradient>
<pattern id="paper" width="24" height="24" patternUnits="userSpaceOnUse"><path class="bg-grid" d="M24 0H0V24" fill="none"/></pattern>
<filter id="glow" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<style>@media (prefers-color-scheme: dark) { #bg stop:first-child { stop-color: #0f1828; } #bg stop:last-child { stop-color: #070c16; } }</style>
</defs>`

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
    ...(d.zones ?? []).filter((z) => z.to == null && z.label).map((z) => ({ label: z.label!, price: (z.top + z.bottom) / 2, kind: z.kind as string })),
    ...(d.lines ?? []).filter((l) => l.to == null && l.label).map((l) => ({ label: l.label!, price: l.y, kind: l.kind ?? 'neutral' })),
  ]
  const gutterW = gutterLabels.length ? GUTTER_GAP + Math.max(...gutterLabels.map((g) => textWidth(g.label))) + TAG_PAD * 2 : 0
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
  out.push(DEFS)
  out.push(`<rect class="bg" width="${width}" height="${height}" rx="10"/>`)
  out.push(`<rect width="${width}" height="${height}" rx="10" fill="url(#paper)"/>`)
  out.push(`<rect class="frame" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="9.5"/>`)
  out.push(`<rect fill="url(#edge)" x="0" y="40" width="${width}" height="1"/>`)
  out.push(`<rect class="title-mark" x="${DEFAULT_PAD.left}" y="15" width="3" height="14" rx="1.5"/>`)
  out.push(`<text class="title" x="${DEFAULT_PAD.left + 10}" y="26">${esc(d.title)}</text>`)

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

  out.push('<g class="candles">')
  d.candles.forEach((c, i) => c && drawCandle(x(i), c))
  if (d.big) drawCandle(x(d.candles.length + 1.5), d.big.ohlc, BODY * 2.4)
  out.push('</g>')
  if (d.big) {
    const cx = x(d.candles.length + 1.5)
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
    out.push(
      `<g class="tag t-${g.kind}"><rect x="${gx}" y="${r1(gy - TAG_H / 2)}" width="${r1(textWidth(g.label) + TAG_PAD * 2)}" height="${TAG_H}" rx="3"/>` +
        `<text x="${gx + TAG_PAD}" y="${gy}" dy="0.35em">${esc(g.label)}</text></g>`,
    )
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
