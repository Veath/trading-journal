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
  orderId?: number
  positionSide?: 'BOTH' | 'LONG' | 'SHORT' // 双向持仓模式下为 LONG / SHORT
}

export interface AlgoOrder {
  id: number
  type: string // STOP_MARKET / TAKE_PROFIT_MARKET / TRAILING_STOP_MARKET ...
  side: 'BUY' | 'SELL'
  positionSide: string // LONG / SHORT / BOTH（单向持仓）
  qty: number
  triggerPrice: number
  workingType: string
  status: string // NEW / CANCELED / EXPIRED / FINISHED ...
  actualOrderId: number | null // 触发后生成的订单
  createTime: number
}

export interface Protection {
  stop: AlgoOrder | null // 持仓期间第一张止损单：初始止损
  target: AlgoOrder | null // 持仓期间第一张止盈单
  stops: AlgoOrder[] // 全部止损单（含移动止损），按创建时间
  triggered: AlgoOrder | null // 触发平仓的条件单；手动平仓时为 null
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
 * 双向持仓模式下只看同一 positionSide 的成交，避免把反手前平多的 SELL 当成开空。
 */
export function findPosition(fills: Fill[], direction: 'long' | 'short', fromMs: number): Position | null {
  const openSide = direction === 'long' ? 'BUY' : 'SELL'
  const side = direction === 'long' ? 'LONG' : 'SHORT'
  const sorted = fills
    .filter((f) => !f.positionSide || f.positionSide === 'BOTH' || f.positionSide === side)
    .sort((a, b) => a.time - b.time || a.id - b.id)
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

const STOP_TYPES = new Set(['STOP_MARKET', 'STOP'])
const TP_TYPES = new Set(['TAKE_PROFIT_MARKET', 'TAKE_PROFIT'])

/**
 * 找这笔仓位的保护单：开仓后（放宽 1 秒）到平仓之间创建、方向是平仓方向的条件单。
 * 第一张止损单是初始止损（R 按它算），之后的视为移动止损。
 */
export function findProtection(orders: AlgoOrder[], pos: Position, direction: 'long' | 'short'): Protection {
  const closeSide = direction === 'long' ? 'SELL' : 'BUY'
  const positionSide = direction === 'long' ? 'LONG' : 'SHORT'
  const end = pos.closeTime ?? Infinity
  const mine = orders
    .filter((o) => o.side === closeSide && (o.positionSide === positionSide || o.positionSide === 'BOTH'))
    .filter((o) => o.createTime >= pos.openTime - 1000 && o.createTime <= end)
    .sort((a, b) => a.createTime - b.createTime || a.id - b.id)
  const stops = mine.filter((o) => STOP_TYPES.has(o.type))
  const closeOrders = new Set(pos.fills.filter((f) => f.side === closeSide).map((f) => f.orderId))
  return {
    stop: stops[0] ?? null,
    target: mine.find((o) => TP_TYPES.has(o.type)) ?? null,
    stops,
    triggered: mine.find((o) => o.status === 'FINISHED' && o.actualOrderId !== null && closeOrders.has(o.actualOrderId)) ?? null,
  }
}
