import type { Trade } from '../types'
import { PERIOD_LABELS, type Filters, type Period } from '../lib/filters'

interface Props {
  trades: Trade[]
  value: Filters
  onChange: (f: Filters) => void
}

const unique = (xs: string[]) => [...new Set(xs)].sort()

export default function FilterBar({ trades, value, onChange }: Props) {
  const strategies = unique(trades.map((t) => t.strategy))
  const symbols = unique(trades.map((t) => t.symbol))
  return (
    <div className="filters">
      <div className="segmented" role="group" aria-label="时间范围">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button key={p} className={value.period === p ? 'on' : ''} onClick={() => onChange({ ...value, period: p })}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      <select value={value.strategy} onChange={(e) => onChange({ ...value, strategy: e.target.value })}>
        <option value="">全部策略</option>
        {strategies.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select value={value.symbol} onChange={(e) => onChange({ ...value, symbol: e.target.value })}>
        <option value="">全部品种</option>
        {symbols.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  )
}
