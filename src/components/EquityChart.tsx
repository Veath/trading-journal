import { useId, useState } from 'react'
import type { EquityPoint } from '../lib/stats'
import { fmtR, signClass } from '../lib/format'
import { href } from '../lib/router'
import { niceTicks, useWidth } from './useWidth'

const H = 280
const PAD = { top: 20, right: 64, bottom: 28, left: 52 }
const TAG_H = 18

/** 权益曲线（累计 R）+ 水下回撤区域，同一 R 轴；右端为现值标签 */
export default function EquityChart({ points }: { points: EquityPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gid = `eq${useId().replace(/[^\w-]/g, '')}`

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
  const area = `${line} L${x(points.length)},${y(0)} L${x(0)},${y(0)}Z`
  const dd = [`M${x(0)},${y(0)}`, ...points.map((p) => `L${x(p.index)},${y(p.drawdownR)}`), `L${x(points.length)},${y(0)}Z`].join(' ')
  const hp = hover != null ? points[hover] : null
  const last = points.at(-1)!
  const lastTone = signClass(last.cumR) || 'pos'
  // 筛选变化时重放描线动画
  const animKey = `${points.length}-${points[0].id}`

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
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--area-top)' }} />
              <stop offset="1" style={{ stopColor: 'var(--area-top)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
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
          <g key={animKey}>
            <path d={area} className="equity-area" fill={`url(#${gid})`} />
            <path d={dd} className="drawdown" />
            <path d={line} className="equity" pathLength={1} />
            <line className={`last-line ${lastTone}`} x1={PAD.left} x2={width - PAD.right} y1={y(last.cumR)} y2={y(last.cumR)} />
            <circle className={`pulse ${lastTone}`} cx={x(last.index)} cy={y(last.cumR)} r={4} />
            <g className={`axis-tag last-tag ${lastTone}`} transform={`translate(${width - PAD.right + 6},${y(last.cumR) - TAG_H / 2})`}>
              <rect width={PAD.right - 8} height={TAG_H} rx={3} />
              <text x={(PAD.right - 8) / 2} y={TAG_H / 2} dy="0.35em" textAnchor="middle">
                {fmtR(last.cumR, 1)}
              </text>
            </g>
          </g>
          {hp && (
            <g>
              <line className="crosshair" x1={x(hp.index)} x2={x(hp.index)} y1={PAD.top} y2={H - PAD.bottom} />
              <line className="crosshair" x1={PAD.left} x2={width - PAD.right} y1={y(hp.cumR)} y2={y(hp.cumR)} />
              <circle className="equity-dot" cx={x(hp.index)} cy={y(hp.cumR)} r={5} />
              <g className="axis-tag" transform={`translate(2,${y(hp.cumR) - TAG_H / 2})`}>
                <rect width={PAD.left - 6} height={TAG_H} rx={3} />
                <text x={(PAD.left - 6) / 2} y={TAG_H / 2} dy="0.35em" textAnchor="middle">
                  {fmtR(hp.cumR, 1)}
                </text>
              </g>
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
          <div className="tt-row">本笔 <b className={signClass(hp.r)}>{fmtR(hp.r)}</b></div>
          <div className="tt-row">累计 <b>{fmtR(hp.cumR)}</b></div>
          <div className="tt-row">回撤 <b>{fmtR(hp.drawdownR)}</b></div>
        </div>
      )}
      <div className="legend">
        <span><i className="swatch equity-sw" />累计 R</span>
        <span><i className="swatch dd-sw" />回撤</span>
      </div>
    </div>
  )
}
