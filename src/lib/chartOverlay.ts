// lightweight-charts 没有内置的矩形、线段、括号等标注，这里用 series primitive 画在画布上。
// 横坐标一律用 K 线下标（logical index，可为小数），纵坐标用所挂 series 的价格。
// 绘制规则参照 scripts/diagrams/render.ts，让交互图和静态 SVG 看起来一致。
import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import { alpha } from './chartTheme'

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0]

export interface OverlayZone {
  from: number
  to?: number // 省略则延伸到右边缘
  top: number
  bottom: number
  label?: string // 画在区域左上角；想画成右侧标签时放进 tags，这里留空
  color: string
  dashed?: boolean
}
export interface OverlayLine {
  from: number
  to?: number
  y: number
  label?: string // 画在起点上方；想画成右侧标签时放进 tags，这里留空
  labelFrom?: number
  color: string
  dash?: number[]
  width?: number
}
export interface OverlaySegment {
  from: [at: number, value: number]
  to: [at: number, value: number]
  label?: string
  labelPos?: 'above' | 'below'
  color: string
  dash?: number[]
  width?: number
  dots?: boolean // 端点圆点，标签画在中点
}
export interface OverlaySpan {
  from: number
  to: number
  label: string
}
export interface OverlayVLine {
  at: number
  label?: string
  color: string
  width?: number
}
export interface OverlayProfile {
  from: number
  to: number
  rows: { lo: number; hi: number; volume: number }[]
  poc: number
  va: [number, number]
  colors: { row: string; va: string; poc: string }
}

/** 右侧标签：延伸到右边缘的线 / 区域 / 指标的名称，自动错开避免重叠 */
export interface OverlayTag {
  price: number
  label: string
  color: string
}

export interface OverlayItems {
  tags?: OverlayTag[]
  zones?: OverlayZone[]
  lines?: OverlayLine[]
  segments?: OverlaySegment[]
  spans?: OverlaySpan[]
  vlines?: OverlayVLine[]
  profile?: OverlayProfile
  caption?: string // 画在左上角，用于副图标题
}

export interface OverlayStyle {
  font: string
  text: string // 标签文字颜色
  muted: string
  halo: string // 文字描边，与背景同色，避免被 K 线压住
  /** 右边缘位置（K 线下标）；省略时延伸到画布右边 */
  end?: number
}

export class Overlay implements ISeriesPrimitive<Time> {
  private chart?: IChartApiBase<Time>
  private series?: ISeriesApi<SeriesType, Time>
  private readonly views: IPrimitivePaneView[]

  constructor(
    private readonly items: OverlayItems,
    private readonly style: OverlayStyle,
  ) {
    this.views = [
      { zOrder: () => 'bottom', renderer: () => ({ draw: (t) => this.drawBack(t) }) },
      { zOrder: () => 'top', renderer: () => ({ draw: (t) => this.drawFront(t) }) },
    ]
  }

  attached({ chart, series }: SeriesAttachedParameter<Time>) {
    this.chart = chart
    this.series = series
  }

  detached() {
    this.chart = this.series = undefined
  }

  paneViews() {
    return this.views
  }

  /** logicalToCoordinate 对非整数下标返回 0，小数部分按 K 线间距线性插值 */
  private x(i: number): number | null {
    const lo = Math.floor(i)
    const x = this.chart!.timeScale().logicalToCoordinate(lo as Logical)
    return x == null || i === lo ? x : x + (i - lo) * this.half() * 2
  }
  private y(v: number): number | null {
    return this.series!.priceToCoordinate(v)
  }
  private half(): number {
    return this.chart!.timeScale().options().barSpacing / 2
  }
  private right(width: number): number {
    if (this.style.end == null) return width
    return (this.x(this.style.end) ?? width) + this.half()
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
    ctx.textAlign = align
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = this.style.halo
    ctx.strokeText(s, x, y)
    ctx.fillStyle = color
    ctx.fillText(s, x, y)
  }

  private drawTags(ctx: CanvasRenderingContext2D, width: number) {
    const H = 18
    const GAP = 20
    const tags = (this.items.tags ?? [])
      .map((t) => ({ ...t, y: this.y(t.price) }))
      .filter((t): t is OverlayTag & { y: number } => t.y != null)
      .map((t) => ({ ...t, at: t.y })) // at = 原位置，y = 错开后的位置
      .sort((a, b) => a.y - b.y)
    for (let k = 1; k < tags.length; k++) tags[k].y = Math.max(tags[k].y, tags[k - 1].y + GAP)
    const right = this.right(width)
    ctx.font = `600 11px ${this.style.font}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (const t of tags) {
      const w = ctx.measureText(t.label).width + 12
      const x = width - w - 6
      // 被错开的标签用引线连回原位置，和静态 SVG 一致
      if (Math.abs(t.y - t.at) > 2 && x - 3 > right + 2) {
        ctx.strokeStyle = this.style.muted
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(right + 2, t.at)
        ctx.lineTo(x - 3, t.y)
        ctx.stroke()
      }
      ctx.fillStyle = this.style.halo
      ctx.fillRect(x, t.y - H / 2, w, H)
      ctx.fillStyle = alpha(t.color, 0.16)
      ctx.strokeStyle = t.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x + 0.5, t.y - H / 2 + 0.5, w - 1, H - 1, 3)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = t.color
      ctx.fillText(t.label, x + 6, t.y + 0.5)
    }
    ctx.textBaseline = 'alphabetic'
  }

  /** 区域、成交量分布、时间竖线：画在 K 线下面 */
  private drawBack(target: Target) {
    if (!this.chart || !this.series) return
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const half = this.half()
      const right = this.right(mediaSize.width)
      for (const z of this.items.zones ?? []) {
        const x1 = this.x(z.from)
        const y1 = this.y(z.top)
        const y2 = this.y(z.bottom)
        if (x1 == null || y1 == null || y2 == null) continue
        const x2 = z.to == null ? right : (this.x(z.to) ?? right) + half
        // 与 TradingView 的矩形模板一致：实色填充、不画边框；虚线区域（中性参考区）保留虚线边
        ctx.fillStyle = alpha(z.color, z.dashed ? 0.1 : 0.24)
        ctx.fillRect(x1 - half, y1, x2 - x1 + half, Math.max(y2 - y1, 2))
        if (z.dashed) {
          ctx.strokeStyle = alpha(z.color, 0.4)
          ctx.setLineDash([2, 3])
          ctx.strokeRect(x1 - half + 0.5, y1 + 0.5, x2 - x1 + half - 1, Math.max(y2 - y1, 2) - 1)
        }
      }
      ctx.setLineDash([])

      const p = this.items.profile
      if (p) {
        const x1 = this.x(p.from)
        const x2 = this.x(p.to)
        if (x1 != null && x2 != null) {
          const maxW = (x2 - x1 + 2 * half) * 0.6
          const maxV = Math.max(...p.rows.map((r) => r.volume))
          p.rows.forEach((r, i) => {
            const top = this.y(r.hi)
            const bottom = this.y(r.lo)
            if (top == null || bottom == null) return
            ctx.fillStyle = i === p.poc ? p.colors.poc : i >= p.va[0] && i <= p.va[1] ? p.colors.va : p.colors.row
            ctx.fillRect(x1 - half, top, (r.volume / maxV) * maxW, Math.max(1, bottom - top - 1))
          })
        }
      }

      ctx.font = `11px ${this.style.font}`
      for (const v of this.items.vlines ?? []) {
        const x = this.x(v.at)
        if (x == null) continue
        ctx.strokeStyle = v.color
        ctx.lineWidth = v.width ?? 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, mediaSize.height)
        ctx.stroke()
        ctx.setLineDash([])
        if (v.label) this.text(ctx, v.label, x, mediaSize.height - 6, this.style.muted, 'center')
      }
    })
  }

  /** 线、连线、括号和所有文字：画在 K 线上面 */
  private drawFront(target: Target) {
    if (!this.chart || !this.series) return
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const half = this.half()
      const right = this.right(mediaSize.width)
      ctx.font = `12px ${this.style.font}`
      ctx.textBaseline = 'alphabetic'

      // 起点滚出左边界时，标签贴住左边缘，避免看不到
      const LEFT = 6
      for (const z of this.items.zones ?? []) {
        if (!z.label) continue
        const x1 = this.x(z.from)
        const y1 = this.y(z.top)
        const x2 = z.to == null ? right : (this.x(z.to) ?? right) + half
        if (x1 != null && y1 != null && x2 > LEFT) this.text(ctx, z.label, Math.max(x1 - half + 6, LEFT), y1 + 14, this.style.muted)
      }

      for (const l of this.items.lines ?? []) {
        const x1 = this.x(l.from)
        const y = this.y(l.y)
        if (x1 == null || y == null) continue
        const x2 = l.to == null ? right : (this.x(l.to) ?? right)
        ctx.strokeStyle = l.color
        ctx.lineWidth = l.width ?? 1.5
        ctx.setLineDash(l.dash ?? [])
        ctx.beginPath()
        ctx.moveTo(x1, y)
        ctx.lineTo(x2, y)
        ctx.stroke()
        ctx.setLineDash([])
        if (l.label && x2 > LEFT) this.text(ctx, l.label, Math.max((l.labelFrom == null ? x1 : (this.x(l.labelFrom) ?? x1)) + 2, LEFT), y - 5, this.style.text)
      }

      for (const s of this.items.segments ?? []) {
        const x1 = this.x(s.from[0])
        const y1 = this.y(s.from[1])
        const x2 = this.x(s.to[0])
        const y2 = this.y(s.to[1])
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue
        ctx.strokeStyle = s.color
        ctx.lineWidth = s.width ?? 2
        ctx.setLineDash(s.dash ?? [])
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.setLineDash([])
        if (s.dots) {
          ctx.fillStyle = s.color
          for (const [cx, cy] of [[x1, y1], [x2, y2]]) {
            ctx.beginPath()
            ctx.arc(cx, cy, 3, 0, Math.PI * 2)
            ctx.fill()
          }
          if (s.label) {
            const ly = s.labelPos === 'below' ? Math.max(y1, y2) + 18 : Math.min(y1, y2) - 8
            this.text(ctx, s.label, (x1 + x2) / 2, ly, this.style.text, 'center')
          }
        } else if (s.label) {
          this.text(ctx, s.label, x1 + 2, y1 - 5, this.style.muted)
        }
      }

      for (const s of this.items.spans ?? []) {
        const x1 = this.x(s.from)
        const x2 = this.x(s.to)
        if (x1 == null || x2 == null) continue
        const l = x1 - half + 3
        const r = x2 + half - 3
        const by = 30
        ctx.strokeStyle = this.style.muted
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(l, by + 6)
        ctx.lineTo(l, by)
        ctx.lineTo(r, by)
        ctx.lineTo(r, by + 6)
        ctx.stroke()
        this.text(ctx, s.label, (l + r) / 2, by - 6, this.style.muted, 'center')
      }

      this.drawTags(ctx, mediaSize.width)
      if (this.items.caption) this.text(ctx, this.items.caption, 8, 16, this.style.muted)
    })
  }
}
