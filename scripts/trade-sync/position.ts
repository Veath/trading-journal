// 纯函数：从 Binance 成交记录里找出一笔交易对应的仓位，并把结果写回交易文件的 frontmatter。

export interface Fill {
  id: number
  time: number // ms
  side: 'BUY' | 'SELL'
  price: number
  qty: number
  realizedPnl: number // Binance 的已实现盈亏，不含手续费
  commission: number
  commissionAsset: string
}

export interface Position {
  fills: Fill[]
  openTime: number
  closeTime: number | null // 仍持仓时为 null
  size: number // 累计开仓数量
  entry: number // 开仓成交均价
  exit: number | null // 平仓成交均价
  realizedPnl: number
  commission: number
  commissionAssets: string[]
}

const EPS = 1e-9
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
export const round = (x: number, digits: number) => Number(x.toFixed(digits))

/**
 * 从 fromMs 起第一笔开仓方向的成交开始累计，直到仓位归零。
 * 做多的开仓方向是 BUY，做空是 SELL；fromMs 之前的成交忽略（属于更早的交易）。
 */
export function findPosition(fills: Fill[], direction: 'long' | 'short', fromMs: number): Position | null {
  const openSide = direction === 'long' ? 'BUY' : 'SELL'
  const sorted = [...fills].sort((a, b) => a.time - b.time || a.id - b.id)
  const start = sorted.findIndex((f) => f.time >= fromMs && f.side === openSide)
  if (start < 0) return null

  const used: Fill[] = []
  let net = 0
  let closeTime: number | null = null
  for (const f of sorted.slice(start)) {
    used.push(f)
    net += f.side === openSide ? f.qty : -f.qty
    if (f.side !== openSide && net <= EPS) {
      closeTime = f.time
      break
    }
  }

  const opens = used.filter((f) => f.side === openSide)
  const closes = used.filter((f) => f.side !== openSide)
  const vwap = (xs: Fill[]) => sum(xs.map((f) => f.price * f.qty)) / sum(xs.map((f) => f.qty))
  return {
    fills: used,
    openTime: opens[0].time,
    closeTime,
    size: sum(opens.map((f) => f.qty)),
    entry: vwap(opens),
    exit: closes.length ? vwap(closes) : null,
    realizedPnl: sum(used.map((f) => f.realizedPnl)),
    commission: sum(used.map((f) => f.commission)),
    commissionAssets: [...new Set(used.map((f) => f.commissionAsset))],
  }
}

/** 字段值为空，或注释里标了「待补 / 估算」，才允许自动填 */
export const isPlaceholder = (value: string, comment: string) => value === '' || /待补|估算/.test(comment)

export interface FieldUpdate {
  raw: string
  changed: boolean
  previous: string // 原来的值（不含注释）
  reason?: string // 没改的原因
}

const COMMENT_COL = 25 // 与模板对齐：注释从第 26 列开始

const formatLine = (field: string, value: number, note: string) => {
  const text = `${field}: ${value}`
  return `${text.padEnd(COMMENT_COL)}${text.length >= COMMENT_COL ? ' ' : ''}# ${note}`
}

/**
 * 只改 frontmatter 里的 `field:` 那一行，保留其他行和注释。
 * 字段不存在时，如果给了 after，就在 `after:` 那一行后面插入新行。
 * force 为 true 时覆盖已有值（值相同则不改），原值写进注释。
 */
export function setField(raw: string, field: string, value: number, note: string, after?: string, force = false): FieldUpdate {
  const end = raw.indexOf('\n---', 3)
  if (!raw.startsWith('---') || end < 0) return { raw, changed: false, previous: '', reason: '没有 frontmatter' }
  const head = raw.slice(0, end)
  const re = new RegExp(`^${field}:(.*)$`, 'm')
  const m = re.exec(head)
  if (!m) {
    const anchor = after ? new RegExp(`^${after}:.*$`, 'm').exec(head) : null
    if (!anchor) return { raw, changed: false, previous: '', reason: `没有 ${field} 字段` }
    const at = anchor.index + anchor[0].length
    return { raw: `${raw.slice(0, at)}\n${formatLine(field, value, note)}${raw.slice(at)}`, changed: true, previous: '' }
  }

  const rest = m[1]
  const hash = rest.indexOf('#')
  const previous = (hash < 0 ? rest : rest.slice(0, hash)).trim()
  const comment = hash < 0 ? '' : rest.slice(hash + 1).trim()
  if (previous !== '' && Number(previous) === value) return { raw, changed: false, previous, reason: '值相同' }
  if (!force && !isPlaceholder(previous, comment)) return { raw, changed: false, previous, reason: '已有值' }

  const fullNote = previous ? `${note}（原${/估算/.test(comment) ? '估算' : '值'} ${previous}）` : note
  const line = formatLine(field, value, fullNote)
  const updated = head.slice(0, m.index) + line + head.slice(m.index + m[0].length) + raw.slice(end)
  return { raw: updated, changed: updated !== raw, previous }
}
