import { useState } from 'react'
import type { EquityPoint } from '../lib/stats'
import { fmtR } from '../lib/format'
import { href } from '../lib/router'
import { niceTicks, useWidth } from './useWidth'

const H = 260
const PAD = { top: 16, right: 16, bottom: 28, left: 48 }

/** 权益曲线（累计 R）+ 水下回撤区域，同一 R 轴 */
export default function EquityChart({ points }: { points: EquityPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  if (points.length === 0) return <div className="empty">暂无已平仓交易</div>

  const all = [0, ...points.map((p) => p.cumR), ...points.map((p) => p.drawdownR)]
  const ticks = niceTicks(Math.min(...all), Math.max(...all))
  const yMin = Math.min(ticks[0], ...all)
  const yMax = Math.max(ticks.at(-1)!, ...all)
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / points.length) * innerW)
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin || 1)) * innerH

  // index 0 是起点 0R
  const line = [`M${x(0)},${y(0)}`, ...points.map((p) => `L${x(p.index)},${y(p.cumR)}`)].join(' ')
  const dd = [`M${x(0)},${y(0)}`, ...points.map((p) => `L${x(p.index)},${y(p.drawdownR)}`), `L${x(points.length)},${y(0)}Z`].join(' ')
  const hp = hover != null ? points[hover] : null

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left) / rect.width) * points.length)
    setHover(Math.min(points.length, Math.max(1, i)) - 1)
  }

  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(innerW / 48)))

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="权益曲线（累计 R）与回撤">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {t}R
              </text>
            </g>
          ))}
          {points.map((p) =>
            p.index % labelEvery === 0 || p.index === 1 ? (
              <text key={p.id} className="tick" x={x(p.index)} y={H - 8} textAnchor="middle">
                #{p.index}
              </text>
            ) : null,
          )}
          <path d={dd} className="drawdown" />
          <path d={line} className="equity" />
          {hp && (
            <g>
              <line className="crosshair" x1={x(hp.index)} x2={x(hp.index)} y1={PAD.top} y2={H - PAD.bottom} />
              <circle className="equity-dot" cx={x(hp.index)} cy={y(hp.cumR)} r={5} />
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onClick={() => hp && (window.location.hash = href('trades', hp.id))}
            style={{ cursor: hp ? 'pointer' : undefined }}
          />
        </svg>
      )}
      {hp && (
        <div className="tooltip" style={{ left: Math.min(x(hp.index) + 12, width - 180), top: 8 }}>
          <div className="tt-title">
            #{hp.index} · {hp.date}
          </div>
          <div>本笔 {fmtR(hp.r)}</div>
          <div>累计 {fmtR(hp.cumR)}</div>
          <div>回撤 {fmtR(hp.drawdownR)}</div>
        </div>
      )}
      <div className="legend">
        <span><i className="swatch equity-sw" />累计 R</span>
        <span><i className="swatch dd-sw" />回撤</span>
      </div>
    </div>
  )
}
