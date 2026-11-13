// Binance 只读接口（需要签名）。只发 GET 请求，不下单、不划转。
// 密钥放在 .env.local：BINANCE_API_KEY、BINANCE_API_SECRET（创建时只勾「允许读取」）。
import { createHmac } from 'node:crypto'
import type { Fill } from './position.ts'

const FAPI = 'https://fapi.binance.com'
const SAPI = 'https://api.binance.com'
const WEEK = 7 * 864e5 - 1 // userTrades 一次最多查 7 天

export interface Client {
  get<T>(base: string, path: string, params?: Record<string, string | number>): Promise<T>
}

export function createClient(key: string, secret: string): Client {
  let offset: number | null = null
  return {
    async get(base, path, params = {}) {
      if (offset === null) {
        const res = await fetch(`${FAPI}/fapi/v1/time`)
        offset = ((await res.json()) as { serverTime: number }).serverTime - Date.now()
      }
      const query = new URLSearchParams(
        Object.entries({ ...params, recvWindow: 10000, timestamp: Date.now() + offset }).map(([k, v]) => [k, String(v)]),
      ).toString()
      const signature = createHmac('sha256', secret).update(query).digest('hex')
      const res = await fetch(`${base}${path}?${query}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': key } })
      const body = await res.text()
      if (!res.ok) throw new Error(`Binance ${path} 请求失败 ${res.status}：${body}`)
      return JSON.parse(body)
    },
  }
}

/** 确认 Key 只有读取权限；有交易、提现、划转等权限就拒绝使用 */
export async function assertReadOnly(client: Client): Promise<void> {
  const r = await client.get<Record<string, unknown>>(SAPI, '/sapi/v1/account/apiRestrictions')
  if (r.enableReading !== true) throw new Error('这个 API Key 没有开启读取权限')
  const extra = Object.entries(r)
    .filter(([k, v]) => v === true && k !== 'enableReading' && k !== 'ipRestrict')
    .map(([k]) => k)
  if (extra.length) {
    throw new Error(`这个 API Key 除了读取还开了 ${extra.join('、')}。请换一个只勾「允许读取」的 Key`)
  }
  if (r.ipRestrict !== true) console.warn('提示：这个 Key 没有绑定 IP，建议在币安 API 管理里限制为你的 IP')
}

interface RawTrade {
  id: number
  time: number
  side: 'BUY' | 'SELL'
  price: string
  qty: string
  realizedPnl: string
  commission: string
  commissionAsset: string
}

export async function userTrades(client: Client, symbol: string, start: number, end: number): Promise<Fill[]> {
  const fills: Fill[] = []
  for (let s = start; s < end; s += WEEK + 1) {
    const e = Math.min(s + WEEK, end)
    const rows = await client.get<RawTrade[]>(FAPI, '/fapi/v1/userTrades', { symbol, startTime: s, endTime: e, limit: 1000 })
    if (rows.length === 1000) console.warn(`提示：${symbol} 这段时间成交超过 1000 笔，结果可能不完整`)
    for (const r of rows) {
      fills.push({
        id: r.id,
        time: r.time,
        side: r.side,
        price: Number(r.price),
        qty: Number(r.qty),
        realizedPnl: Number(r.realizedPnl),
        commission: Number(r.commission),
        commissionAsset: r.commissionAsset,
      })
    }
  }
  return fills
}

/** 持仓期间的资金费（正数为收入） */
export async function fundingFees(client: Client, symbol: string, start: number, end: number): Promise<number> {
  const rows = await client.get<{ income: string; asset: string }[]>(FAPI, '/fapi/v1/income', {
    symbol,
    incomeType: 'FUNDING_FEE',
    startTime: start,
    endTime: end,
    limit: 1000,
  })
  return rows.reduce((a, r) => a + Number(r.income), 0)
}
