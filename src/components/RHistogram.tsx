import { useState } from 'react'
import type { Bucket } from '../lib/stats'
import { useWidth } from './useWidth'

const H = 200
const PAD = { top: 12, right: 8, bottom: 28, left: 32 }

/** 单笔 R 分布直方图：负 R 红、正 R 蓝、保本灰 */
export default function RHistogram({ buckets }: { buckets: Bucket[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const maxCount = Math.max(1, ...buckets.map((b) => b.count))
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = H - PAD.top - PAD.bottom
  const bw = innerW / buckets.length
  const y = (c: number) => PAD.top + innerH - (c / maxCount) * innerH
  const hb = hover != null ? buckets[hover] : null
  const label = (b: Bucket, i: number) => (i === 0 ? `≤ ${b.center}R` : i === buckets.length - 1 ? `≥ ${b.center}R` : `${b.center > 0 ? '+' : ''}${b.center}R`)

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="R 倍数分布">
          <line className="axis" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
          <text className="tick" x={PAD.left - 6} y={y(maxCount)} dy="0.32em" textAnchor="end">{maxCount}</text>
          {buckets.map((b, i) => {
            const h = y(0) - y(b.count)
            const bx = PAD.left + i * bw + 1
            const w = Math.max(1, bw - 2)
            return (
              <g key={b.center} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={PAD.left + i * bw} y={PAD.top} width={bw} height={innerH} fill="transparent" />
                {b.count > 0 && (
                  <path
                    className={b.center < 0 ? 'bar-neg' : b.center > 0 ? 'bar-pos' : 'bar-zero'}
                    opacity={hover == null || hover === i ? 1 : 0.5}
                    d={`M${bx},${y(0)} V${y(b.count) + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, w / 2)},-${Math.min(4, h)} H${bx + w - Math.min(4, w / 2)} q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, h)} V${y(0)}Z`}
                  />
                )}
                {Number.isInteger(b.center) && (
                  <text className="tick" x={PAD.left + (i + 0.5) * bw} y={H - 8} textAnchor="middle">
                    {b.center}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {hb && hover != null && (
        <div className="tooltip" style={{ left: Math.min(PAD.left + (hover + 1) * bw + 4, width - 140), top: 8 }}>
          <div className="tt-title">{label(hb, hover)}</div>
          <div>{hb.count} 笔</div>
        </div>
      )}
    </div>
  )
}
