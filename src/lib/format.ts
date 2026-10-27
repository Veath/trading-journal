const dash = '—'

export function fmtR(r: number | null | undefined, digits = 2): string {
  if (r == null || Number.isNaN(r)) return dash
  return `${r > 0 ? '+' : ''}${r.toFixed(digits)}R`
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null) return dash
  return `${(x * 100).toFixed(digits)}%`
}

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x == null) return dash
  if (x === Infinity) return '∞'
  return x.toFixed(digits)
}

export function fmtMoney(x: number | null | undefined): string {
  if (x == null) return dash
  return `${x > 0 ? '+' : ''}${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 正负值的 CSS class，用于着色 */
export const signClass = (x: number | null | undefined) => (x == null || x === 0 ? '' : x > 0 ? 'pos' : 'neg')
