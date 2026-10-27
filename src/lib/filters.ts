import type { Trade } from '../types'

export type Period = 'all' | '7d' | '30d' | 'month' | 'year'

export interface Filters {
  period: Period
  strategy: string
  symbol: string
}

export const defaultFilters: Filters = { period: 'all', strategy: '', symbol: '' }

export const PERIOD_LABELS: Record<Period, string> = {
  all: '全部',
  '7d': '近 7 天',
  '30d': '近 30 天',
  month: '本月',
  year: '今年',
}

function periodStart(period: Period, now = new Date()): string | null {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  switch (period) {
    case 'all':
      return null
    case '7d':
      return iso(new Date(now.getTime() - 7 * 864e5))
    case '30d':
      return iso(new Date(now.getTime() - 30 * 864e5))
    case 'month':
      return `${iso(now).slice(0, 7)}-01`
    case 'year':
      return `${now.getFullYear()}-01-01`
  }
}

export function applyFilters(trades: Trade[], f: Filters): Trade[] {
  const start = periodStart(f.period)
  return trades.filter(
    (t) =>
      (!start || t.date >= start) && (!f.strategy || t.strategy === f.strategy) && (!f.symbol || t.symbol === f.symbol),
  )
}
