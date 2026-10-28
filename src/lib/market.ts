// 行情数据：Binance USDT 永续公开 K 线（无需账户或密钥），以及复盘图旁注 journal/charts/<id>.json 的类型与时间换算。
// 仪表盘的交互图（TradeChart）和 scripts/trade-chart 生成的静态 SVG 共用这里的逻辑。
import type { Trade } from '../types'

export type Interval = '1d' | '4h' | '1h' | '15m'

export const INTERVALS: Record<Interval, { ms: number; label: string }> = {
  '1d': { ms: 864e5, label: '日线' },
  '4h': { ms: 4 * 36e5, label: '4H' },
  '1h': { ms: 36e5, label: '1H' },
  '15m': { ms: 15 * 6e4, label: '15m' },
}

export interface Candle {
  t: number // 开盘时间 ms（UTC）
  open: number
  high: number
  low: number
  close: number
}

/** 旁注中的时间写成「YYYY-MM-DD HH:mm」，按 tz 解释 */
export interface ChartZone {
  from: string
  to?: string // 省略则延伸到右边缘
  top: number
  bottom: number
  label?: string
  kind: 'bull' | 'bear' | 'neutral' | 'accent'
}
export interface ChartLine {
  from: string
  to?: string
  y: number
  label?: string
  kind?: 'neutral' | 'stop' | 'target' | 'entry'
}
export interface ChartMark {
  at: string
  text: string
  pos: 'above' | 'below'
}
export interface IntervalSpec {
  zones?: ChartZone[]
  lines?: ChartLine[]
  marks?: ChartMark[]
}
export interface Sidecar {
  symbol?: string // 交易所代码，如 BTCUSDT；默认由交易的 symbol 推断
  tz?: string // 交易时间与图表时间轴的时区偏移，如 "+08:00"；默认纽约时间（与模板约定一致）
  exitTime?: string // 平仓时间
  timeframes?: Interval[] // 要显示 / 生成的周期，默认 1d / 4h / 1h
  intervals?: Partial<Record<Interval, IntervalSpec>>
}

export const DEFAULT_TIMEFRAMES: Interval[] = ['1d', '4h', '1h']

/** 纽约时区在某天的 UTC 偏移，如 "-04:00" */
export function newYorkOffset(date: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')!.value // "GMT-4"
  const h = Number(name.replace('GMT', '') || 0)
  return `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`
}

export const parseTime = (s: string, tz: string) => new Date(`${s.replace(' ', 'T')}:00${tz}`).getTime()

export function offsetMs(tz: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz)
  if (!m) throw new Error(`无法识别的时区偏移 ${tz}，应写成 +08:00 这种格式`)
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 6e4
}

/** 交易所用的时区：旁注 tz 优先，否则按交易当天的纽约时间 */
export const tradeTz = (trade: Pick<Trade, 'date'>, sidecar: Sidecar) => sidecar.tz ?? newYorkOffset(trade.date)

export const binanceSymbol = (trade: Pick<Trade, 'symbol'>, sidecar: Sidecar) =>
  sidecar.symbol ?? (trade.symbol.toUpperCase().endsWith('USDT') ? trade.symbol.toUpperCase() : `${trade.symbol.toUpperCase()}USDT`)

export async function fetchKlines(symbol: string, interval: Interval, start: number, end: number): Promise<Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${Math.floor(start)}&endTime=${Math.floor(end)}&limit=1000`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance 请求失败 ${res.status}：${await res.text()}`)
  const rows = (await res.json()) as [number, string, string, string, string][]
  return rows.map((r) => ({ t: r[0], open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]) }))
}

/** 时间 → 所在 K 线下标；超出范围时取最近的一端 */
export function indexAt(candles: Candle[], ms: number, intervalMs: number): number {
  const i = candles.findIndex((c) => ms >= c.t && ms < c.t + intervalMs)
  if (i >= 0) return i
  return ms < candles[0].t ? 0 : candles.length - 1
}
