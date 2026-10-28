import type { Trade } from '../types'

/** 风险 / 回报梯：左段止损→入场（-1R），右段入场→目标，宽度按价格距离等比；有出场价时标出出场位置 */
export default function RiskLadder({ trade: t }: { trade: Trade }) {
  if (t.entry == null || t.stop == null || t.target == null) {
    return <div className="tc-meta">入场 {t.entry ?? '—'} · 止损 {t.stop ?? '—'} · 目标 {t.target ?? '—'}</div>
  }
  const risk = Math.abs(t.entry - t.stop)
  const reward = Math.abs(t.target - t.entry)
  // 多空通用：从止损到目标的进度
  const exitAt = t.exit != null && t.target !== t.stop ? Math.min(1, Math.max(0, (t.exit - t.stop) / (t.target - t.stop))) : null
  return (
    <div className="ladder" title={`止损 ${t.stop} · 入场 ${t.entry} · 目标 ${t.target}${t.exit != null ? ` · 出场 ${t.exit}` : ''}`}>
      <div className="ladder-bar" aria-hidden="true">
        <i className="risk" style={{ flex: risk }} />
        <i className="reward" style={{ flex: reward }} />
        {exitAt != null && <b style={{ left: `${exitAt * 100}%` }} />}
      </div>
      <div className="ladder-labels">
        <span style={{ flex: risk }}>止损 {t.stop}</span>
        <span style={{ flex: reward }}>
          入场 {t.entry}
          <span>目标 {t.target}</span>
        </span>
      </div>
    </div>
  )
}
