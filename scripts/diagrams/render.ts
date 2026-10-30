// 把「K 线数据 + 标注」渲染成 SVG 示意图。
// 风格与仪表盘一致（交易终端）：蓝墨底 + 坐标纸网格，上涨蓝、下跌红、关键位（入场）琥珀；
// 内嵌 prefers-color-scheme，浅色 / 深色模式都可读。
// 延伸到右边缘的线 / 区域，标签画成右侧价格轴标签（按类型着色），并自动错开避免重叠；
// 有终点（to）的线段和区域，标签放在起点上方。
// 指标类示意图另有：价格区折线（VWAP 及其带）、两点连线（背离 / 通道）、横向成交量分布（FRVP）、下方副图（RSI、成交量）、
// 时间竖线（Fib 趋势时间）。

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
  kind?: 'neutral' | 'stop' | 'target' | 'entry' | 'poc'
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

export interface Series {
  values: (number | null)[] // 与 candles 对齐，null = 不画
  label?: string // 画成右侧价格轴标签，位置取最后一个值
  kind: 'main' | 'band' | 'ema1' | 'ema2' | 'ema3' | 'ema4' // ema1–4 由快到慢
}

export interface Segment {
  from: [at: number, value: number]
  to: [at: number, value: number]
  label?: string // accent 画在线段中点；其他类型画在起点上方（同 Line）
  labelPos?: 'above' | 'below' // 默认 above
  kind?: 'accent' | 'neutral' | 'bull' | 'bear' // 默认 accent（带端点圆点）；其他类型为细线，用于通道、量能趋势线
}

export interface VLine {
  at: number // K 线下标，可为小数
  label?: string // 画在图底部
  kind?: 'neutral' | 'accent'
}

export interface Profile {
  from: number // 区间起止 K 线下标
  to: number
  rows: { lo: number; hi: number; volume: number }[]
  poc: number // rows 下标
  va: [lo: number, hi: number] // Value Area 覆盖的 rows 下标（含两端）
}

export interface Panel {
  title: string
  values?: (number | null)[]
  signal?: (number | null)[] // 第二条线（如 MACD 的 Signal）
  histogram?: (number | null)[] // 从 0 轴画柱，正蓝负红
  volume?: number[] // 成交量柱，颜色跟随对应 K 线涨跌
  curves?: { values: (number | null)[]; kind: 'bull' | 'bear' }[] // 量能曲线
  min: number
  max: number
  levels?: { y: number; label?: string }[]
  band?: { top: number; bottom: number; label: string } // 底色区域，标签画成右侧标签
  segments?: Segment[]
  marks?: Mark[]
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
  series?: Series[]
  segments?: Segment[]
  profile?: Profile // 横向柱从区间左边缘向右画，最长占区间宽度的 60%
  panel?: Panel // 价格区下方的副图
  vlines?: VLine[] // 贯穿价格区和副图的时间竖线
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
const PANEL_GAP = 34 // 价格区与副图的间距（含副图标题）
const PANEL_H = 140

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
  .bg-grid { stroke: none; }
  .frame { fill: none; stroke: #d2c7b5; }
  .title-mark { fill: #2f5fd0; }
  .title { fill: #1a1a1a; font-weight: 650; font-size: 14px; }
  text { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 12px; fill: #1a1a1a; paint-order: stroke; stroke: #e8e0d3; stroke-width: 3px; stroke-linejoin: round; }
  .muted { fill: #5e564b; }
  .wick { stroke-width: 1.5; }
  .up { fill: none; stroke: #1a1a1a; }
  .down { fill: #1a1a1a; stroke: #1a1a1a; }
  .z-bull { fill: rgba(62, 142, 65, 0.24); stroke: none; }
  .z-bear { fill: rgba(192, 80, 77, 0.24); stroke: none; }
  .z-neutral { fill: rgba(94, 86, 75, 0.08); stroke: rgba(94, 86, 75, 0.3); stroke-dasharray: 2 3; }
  .z-accent { fill: rgba(212, 160, 60, 0.24); stroke: none; }
  .l-neutral { stroke: #8a8278; stroke-dasharray: 4 3; }
  .l-stop { stroke: #c0504d; stroke-dasharray: 6 3; }
  .l-target { stroke: #3e8e41; stroke-dasharray: 6 3; }
  .l-entry { stroke: #2f5fd0; }
  .l-poc { stroke: #7b3fa0; }
  .bracket { stroke: #8a8278; fill: none; }
  .grid { stroke: rgba(94, 86, 75, 0.12); stroke-dasharray: 2 4; }
  .tick { font-family: 'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', sans-serif; font-size: 11px; fill: #665e53; stroke: none; }
  .arrow { fill: #2f5fd0; stroke: none; }
  .tag rect { stroke-width: 1; }
  .tag text { stroke: none; font-weight: 600; }
  .t-neutral rect { fill: rgba(94, 86, 75, 0.1); stroke: rgba(94, 86, 75, 0.4); }
  .t-neutral text { fill: #5e564b; }
  .t-stop rect, .t-bear rect { fill: rgba(192, 80, 77, 0.12); stroke: #c0504d; }
  .t-stop text, .t-bear text { fill: #a33a37; }
  .t-target rect, .t-bull rect { fill: rgba(62, 142, 65, 0.12); stroke: #3e8e41; }
  .t-target text, .t-bull text { fill: #2e7d32; }
  .t-entry rect, .t-accent rect { fill: rgba(47, 95, 208, 0.1); stroke: #2f5fd0; }
  .t-entry text, .t-accent text { fill: #24489e; }
  .t-key rect { fill: rgba(212, 160, 60, 0.14); stroke: #d4a03c; }
  .t-key text { fill: #8a5a0e; }
  .t-poc rect { fill: rgba(123, 63, 160, 0.1); stroke: #7b3fa0; }
  .t-poc text { fill: #5e2d7d; }
  @media (prefers-color-scheme: dark) {
    .bg-grid { stroke: rgba(110, 160, 230, 0.06); }
    .frame { stroke: #1c2839; }
    .title-mark { fill: #6c9cff; }
    .title, text { fill: #e3eaf4; }
    text { stroke: #0a111d; }
    .muted { fill: #a0b0c5; }
    .up { fill: none; stroke: #c5d0de; }
    .down { fill: #8a96a8; stroke: #8a96a8; }
    .z-bull { fill: rgba(92, 191, 96, 0.24); }
    .z-bear { fill: rgba(242, 85, 95, 0.24); }
    .z-neutral { fill: rgba(160, 176, 197, 0.08); stroke: rgba(160, 176, 197, 0.25); }
    .z-accent { fill: rgba(224, 180, 90, 0.24); }
    .l-neutral, .bracket { stroke: #8293ab; }
    .l-stop { stroke: #f2555f; }
    .l-target { stroke: #5cbf60; }
    .l-entry { stroke: #6c9cff; }
    .l-poc { stroke: #b58ce8; }
    .grid { stroke: #182334; }
    .tick { fill: #70829b; }
    .arrow { fill: #6c9cff; }
    .t-neutral rect { fill: rgba(160, 176, 197, 0.1); stroke: rgba(160, 176, 197, 0.45); }
    .t-neutral text { fill: #c5d0de; }
    .t-stop rect, .t-bear rect { fill: rgba(242, 85, 95, 0.16); stroke: #f2555f; }
    .t-stop text, .t-bear text { fill: #ff8f98; }
    .t-target rect, .t-bull rect { fill: rgba(92, 191, 96, 0.16); stroke: #5cbf60; }
    .t-target text, .t-bull text { fill: #9fe0a2; }
    .t-entry rect, .t-accent rect { fill: rgba(108, 156, 255, 0.16); stroke: #6c9cff; }
    .t-entry text, .t-accent text { fill: #b3ccff; }
    .t-key rect { fill: rgba(224, 180, 90, 0.16); stroke: #e0b45a; }
    .t-key text { fill: #ffd38a; }
    .t-poc rect { fill: rgba(181, 140, 232, 0.16); stroke: #b58ce8; }
    .t-poc text { fill: #dcc6ff; }
  }
`

// 指标元素（折线、连线、成交量分布、副图）的样式，只在用到时输出，保持普通示意图不变
const INDICATOR_STYLE = `
  .s-main { stroke: #2f5fd0; stroke-width: 2; fill: none; }
  .s-band { stroke: #8a8278; stroke-width: 1.2; stroke-dasharray: 5 3; fill: none; }
  .s-osc { stroke: #5e564b; stroke-width: 1.6; fill: none; }
  .seg { stroke: #2f5fd0; stroke-width: 2; }
  .s-ema1 { stroke: #2f5fd0; stroke-width: 1.8; fill: none; }
  .s-ema2 { stroke: #b5651d; stroke-width: 1.8; fill: none; }
  .s-ema3 { stroke: #16917f; stroke-width: 1.8; fill: none; }
  .s-ema4 { stroke: #5e564b; stroke-width: 2.4; fill: none; }
  .s-sig { stroke: #2f5fd0; stroke-width: 1.4; fill: none; }
  .h-pos { fill: rgba(62, 142, 65, 0.45); }
  .h-neg { fill: rgba(192, 80, 77, 0.45); }
  .h-vup { fill: rgba(191, 180, 162, 0.8); }
  .h-vdown { fill: rgba(94, 86, 75, 0.8); }
  .t-ema2 rect { fill: rgba(181, 101, 29, 0.1); stroke: #b5651d; }
  .t-ema2 text { fill: #8a4a12; }
  .t-ema3 rect { fill: rgba(22, 145, 127, 0.1); stroke: #16917f; }
  .t-ema3 text { fill: #0f6e60; }
  .t-ema4 rect { fill: rgba(94, 86, 75, 0.12); stroke: #5e564b; }
  .t-ema4 text { fill: #3a342c; }
  .p-row { fill: rgba(94, 86, 75, 0.18); }
  .p-va { fill: rgba(94, 86, 75, 0.38); }
  .p-poc { fill: rgba(123, 63, 160, 0.75); }
  .seg-neutral { stroke: #8a8278; stroke-width: 1.2; stroke-dasharray: 5 3; }
  .seg-bull, .s-bull { stroke: #3e8e41; stroke-width: 1.8; fill: none; }
  .seg-bear, .s-bear { stroke: #c0504d; stroke-width: 1.8; fill: none; }
  .vline { stroke: #8a8278; stroke-width: 1; stroke-dasharray: 3 3; }
  .vline-accent { stroke: #2f5fd0; stroke-width: 1.4; stroke-dasharray: 3 3; }
  @media (prefers-color-scheme: dark) {
    .s-main, .seg { stroke: #6c9cff; }
    .s-band { stroke: #8293ab; }
    .s-osc { stroke: #c5d0de; }
    .s-ema1, .s-sig { stroke: #6c9cff; }
    .s-ema2 { stroke: #a98bf0; }
    .s-ema3 { stroke: #3cc4ae; }
    .s-ema4 { stroke: #c5d0de; }
    .h-pos { fill: rgba(92, 191, 96, 0.45); }
    .h-neg { fill: rgba(242, 85, 95, 0.45); }
    .h-vup { fill: rgba(58, 70, 88, 0.8); }
    .h-vdown { fill: rgba(107, 122, 144, 0.8); }
    .t-ema2 rect { fill: rgba(169, 139, 240, 0.16); stroke: #a98bf0; }
    .t-ema2 text { fill: #cbb8ff; }
    .t-ema3 rect { fill: rgba(60, 196, 174, 0.16); stroke: #3cc4ae; }
    .t-ema3 text { fill: #8fe6d6; }
    .t-ema4 rect { fill: rgba(197, 208, 222, 0.12); stroke: #c5d0de; }
    .t-ema4 text { fill: #e3eaf4; }
    .p-row { fill: rgba(160, 176, 197, 0.18); }
    .p-va { fill: rgba(160, 176, 197, 0.38); }
    .p-poc { fill: rgba(181, 140, 232, 0.75); }
    .seg-neutral, .vline { stroke: #8293ab; }
    .seg-bull, .s-bull { stroke: #5cbf60; }
    .seg-bear, .s-bear { stroke: #f2555f; }
    .vline-accent { stroke: #6c9cff; }
  }
`

// 背景（浅色为米色纸面，深色为渐变）、坐标纸网格（仅深色模式显示）、标题下发光线、K 线辉光（仅深色模式经 CSS 启用）
const DEFS = `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8e0d3"/><stop offset="1" stop-color="#e8e0d3"/></linearGradient>
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
    ...(d.zones ?? []).filter((z) => z.to == null && z.label).map((z) => ({ label: z.label!, price: (z.top + z.bottom) / 2, kind: z.kind === 'accent' ? 'key' : z.kind })),
    ...(d.lines ?? []).filter((l) => l.to == null && l.label).map((l) => ({ label: l.label!, price: l.y, kind: l.kind ?? 'neutral' })),
    ...(d.series ?? [])
      .filter((s) => s.label)
      .map((s) => ({ label: s.label!, price: s.values.filter((v) => v != null).at(-1)!, kind: s.kind === 'main' || s.kind === 'ema1' ? 'accent' : s.kind === 'band' ? 'neutral' : s.kind })),
  ]
  const panelLabels = [
    ...(d.panel?.levels ?? []).filter((l) => l.label).map((l) => ({ label: l.label!, price: l.y, kind: 'neutral' })),
    ...(d.panel?.band ? [{ label: d.panel.band.label, price: (d.panel.band.top + d.panel.band.bottom) / 2, kind: 'bull' }] : []),
  ]
  const tagged = [...gutterLabels, ...panelLabels]
  const gutterW = tagged.length ? GUTTER_GAP + Math.max(...tagged.map((g) => textWidth(g.label))) + TAG_PAD * 2 : 0
  const plotRight = PAD.left + n * STEP
  const width = Math.ceil(Math.max(plotRight + gutterW, DEFAULT_PAD.left + textWidth(d.title, 14)) + PAD.right)
  const panelTop = PAD.top + PLOT_H + PANEL_GAP
  const height = PAD.top + PLOT_H + (d.panel ? PANEL_GAP + PANEL_H : 0) + PAD.bottom

  const prices = [
    ...d.candles.flatMap((c) => (c ? [c[1], c[2]] : [])),
    ...(d.zones ?? []).flatMap((z) => [z.top, z.bottom]),
    ...(d.lines ?? []).map((l) => l.y),
    ...(d.big ? [d.big.ohlc[1], d.big.ohlc[2]] : []),
    ...(d.series ?? []).flatMap((s) => s.values.filter((v): v is number => v != null)),
    ...(d.segments ?? []).flatMap((s) => [s.from[1], s.to[1]]),
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

  if (d.profile) {
    const p = d.profile
    const x1 = x(p.from) - STEP / 2
    const maxW = (zoneX2(p.to) - x1) * 0.6
    const maxV = Math.max(...p.rows.map((r) => r.volume))
    p.rows.forEach((r, i) => {
      const cls = i === p.poc ? 'p-poc' : i >= p.va[0] && i <= p.va[1] ? 'p-va' : 'p-row'
      const top = y(r.hi)
      out.push(`<rect class="${cls}" x="${x1}" y="${top}" width="${r1((r.volume / maxV) * maxW)}" height="${r1(Math.max(1, y(r.lo) - top - 1))}"/>`)
    })
  }

  const vlineBottom = d.panel ? panelTop + PANEL_H : PAD.top + PLOT_H
  for (const v of d.vlines ?? []) {
    out.push(`<line class="vline${v.kind === 'accent' ? '-accent' : ''}" x1="${x(v.at)}" x2="${x(v.at)}" y1="${PAD.top - 4}" y2="${vlineBottom}"/>`)
    if (v.label) out.push(`<text class="tick" x="${x(v.at)}" y="${vlineBottom + 16}" text-anchor="middle">${esc(v.label)}</text>`)
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
    // 影线分上下两段，不穿过空心的阳线实体
    out.push(`<line class="wick ${cls}" x1="${cx}" x2="${cx}" y1="${y(h)}" y2="${top}"/>`)
    out.push(`<line class="wick ${cls}" x1="${cx}" x2="${cx}" y1="${r1(top + bh)}" y2="${y(l)}"/>`)
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

  /** 折线，遇到 null 断开 */
  const polyline = (values: (number | null)[], fy: (v: number) => number, cls: string) => {
    let dPath = ''
    let pen = false
    values.forEach((v, i) => {
      if (v == null || Number.isNaN(v)) return void (pen = false)
      dPath += `${pen ? 'L' : 'M'}${x(i)},${fy(v)} `
      pen = true
    })
    if (dPath) out.push(`<path class="${cls}" d="${dPath.trim()}"/>`)
  }
  const drawSegment = (s: Segment, fy: (v: number) => number) => {
    const [x1, y1, x2, y2] = [x(s.from[0]), fy(s.from[1]), x(s.to[0]), fy(s.to[1])]
    if (s.kind && s.kind !== 'accent') {
      out.push(`<line class="seg-${s.kind}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
      if (s.label) out.push(`<text class="muted" x="${x1 + 2}" y="${y1 - 5}">${esc(s.label)}</text>`)
      return
    }
    out.push(`<line class="seg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
    out.push(`<circle class="arrow" cx="${x1}" cy="${y1}" r="3"/><circle class="arrow" cx="${x2}" cy="${y2}" r="3"/>`)
    const ly = s.labelPos === 'below' ? Math.max(y1, y2) + 18 : Math.min(y1, y2) - 8
    if (s.label) out.push(`<text x="${r1((x1 + x2) / 2)}" y="${r1(ly)}" text-anchor="middle">${esc(s.label)}</text>`)
  }

  for (const s of d.series ?? []) polyline(s.values, y, `s-${s.kind}`)
  for (const s of d.segments ?? []) drawSegment(s, y)

  for (const l of d.lines ?? []) {
    const x1 = x(l.from)
    const x2 = lineX2(l.to)
    out.push(`<line class="l-${l.kind ?? 'neutral'}" x1="${x1}" x2="${x2}" y1="${y(l.y)}" y2="${y(l.y)}" stroke-width="1.5"/>`)
    if (l.label && l.to != null) out.push(`<text x="${(l.labelFrom == null ? x1 : x(l.labelFrom)) + 2}" y="${y(l.y) - 5}">${esc(l.label)}</text>`)
  }

  for (const z of d.zones ?? []) {
    if (z.label && z.to != null) out.push(`<text class="muted" x="${x(z.from) - STEP / 2 + 6}" y="${y(z.top) + 14}">${esc(z.label)}</text>`)
  }

  const drawTags = (labels: typeof gutterLabels, fy: (v: number) => number) => {
    const gutterYs = spreadLabels(labels.map((g) => fy(g.price)))
    labels.forEach((g, i) => {
      const gy = gutterYs[i]
      const lineY = fy(g.price)
      const gx = xEnd + GUTTER_GAP
      if (Math.abs(gy - lineY) > 2) out.push(`<path class="bracket" d="M${xEnd + 2},${lineY} L${gx - 3},${gy}"/>`)
      out.push(
        `<g class="tag t-${g.kind}"><rect x="${gx}" y="${r1(gy - TAG_H / 2)}" width="${r1(textWidth(g.label) + TAG_PAD * 2)}" height="${TAG_H}" rx="3"/>` +
          `<text x="${gx + TAG_PAD}" y="${gy}" dy="0.35em">${esc(g.label)}</text></g>`,
      )
    })
  }
  drawTags(gutterLabels, y)

  /** 标注箭头：above 画在 top 上方，below 画在 bottom 下方 */
  const drawMark = (m: Mark, top: number, bottom: number) => {
    const cx = x(m.at)
    if (m.pos === 'above') {
      const ty = top - 6
      out.push(`<path class="arrow" d="M${cx},${ty} l-4,-6 h8 z"/>`)
      out.push(`<text x="${cx}" y="${ty - 10}" text-anchor="middle">${esc(m.text)}</text>`)
    } else {
      const ty = bottom + 6
      out.push(`<path class="arrow" d="M${cx},${ty} l-4,6 h8 z"/>`)
      out.push(`<text x="${cx}" y="${ty + 20}" text-anchor="middle">${esc(m.text)}</text>`)
    }
  }

  for (const m of d.marks ?? []) {
    const c = d.candles[m.at]
    if (c) drawMark(m, y(c[1]), y(c[2]))
  }

  if (d.panel) {
    const p = d.panel
    const py = (v: number) => r1(panelTop + ((p.max - v) / (p.max - p.min)) * PANEL_H)
    const x0 = PAD.left
    out.push(`<line class="grid" x1="${x0}" x2="${xEnd}" y1="${panelTop - PANEL_GAP + 6}" y2="${panelTop - PANEL_GAP + 6}"/>`)
    out.push(`<text class="muted" x="${x0 + 4}" y="${panelTop - 8}">${esc(p.title)}</text>`)
    if (p.band) {
      out.push(`<rect class="z-bull" x="${x0}" y="${py(p.band.top)}" width="${xEnd - x0}" height="${r1(py(p.band.bottom) - py(p.band.top))}"/>`)
    }
    for (const l of p.levels ?? []) {
      out.push(`<line class="l-neutral" x1="${x0}" x2="${xEnd}" y1="${py(l.y)}" y2="${py(l.y)}" stroke-width="1"/>`)
    }
    p.histogram?.forEach((v, i) => {
      if (v == null || Number.isNaN(v)) return
      const [top, bottom] = v >= 0 ? [py(v), py(0)] : [py(0), py(v)]
      const w = Math.max(2, Math.round(STEP * 0.5))
      out.push(`<rect class="${v >= 0 ? 'h-pos' : 'h-neg'}" x="${r1(x(i) - w / 2)}" y="${top}" width="${w}" height="${r1(Math.max(0.5, bottom - top))}"/>`)
    })
    p.volume?.forEach((v, i) => {
      const c = d.candles[i]
      if (!c) return
      const w = Math.max(2, Math.round(STEP * 0.5))
      out.push(`<rect class="${c[3] >= c[0] ? 'h-vup' : 'h-vdown'}" x="${r1(x(i) - w / 2)}" y="${py(v)}" width="${w}" height="${r1(Math.max(0.5, py(0) - py(v)))}"/>`)
    })
    for (const c of p.curves ?? []) polyline(c.values, py, `s-${c.kind}`)
    if (p.values) polyline(p.values, py, 's-osc')
    if (p.signal) polyline(p.signal, py, 's-sig')
    for (const s of p.segments ?? []) drawSegment(s, py)
    for (const m of p.marks ?? []) {
      const v = p.values?.[m.at] ?? p.volume?.[m.at]
      if (v != null) drawMark(m, py(v), py(v))
    }
    drawTags(panelLabels, py)
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(d.title)}">`,
    `<style>${STYLE}${d.series || d.segments || d.profile || d.panel || d.vlines ? INDICATOR_STYLE : ''}</style>`,
    ...out,
    '</svg>',
    '',
  ].join('\n')
}
