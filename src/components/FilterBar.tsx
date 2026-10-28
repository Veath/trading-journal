import type { Trade } from '../types'
import { PERIOD_LABELS, type Filters, type Period } from '../lib/filters'
import Select from './Select'

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
          <button
            key={p}
            type="button"
            aria-pressed={value.period === p}
            className={value.period === p ? 'on' : ''}
            onClick={() => onChange({ ...value, period: p })}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      <div className="filter-selects">
        <Select
          label="策略"
          value={value.strategy}
          onChange={(strategy) => onChange({ ...value, strategy })}
          options={[{ value: '', label: '全部策略' }, ...strategies.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          label="品种"
          value={value.symbol}
          onChange={(symbol) => onChange({ ...value, symbol })}
          options={[{ value: '', label: '全部品种' }, ...symbols.map((s) => ({ value: s, label: s }))]}
        />
      </div>
    </div>
  )
}
