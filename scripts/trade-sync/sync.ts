// 用法：pnpm trade:sync <交易 id ...> [--write]
//       pnpm trade:sync --pending [--write]   # 所有 size / pnl / fees 还空着或标了「待补 / 估算」的已平仓交易
// 用 Binance 只读 API 查这笔交易的实际成交，算出仓位、成交均价、扣费后盈亏。
// 默认只打印结果；加 --write 才写回交易文件，并且只填空着或标了「待补 / 估算」的字段，已有的值不覆盖。
// 加 --prices 时，entry / exit 也用实际成交均价覆盖（原值写进注释）。
// 密钥放在 .env.local：BINANCE_API_KEY、BINANCE_API_SECRET（只勾「允许读取」的 Key）。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseTrade, splitFrontmatter } from '../../src/lib/parse.ts'
import { binanceSymbol, parseTime, tradeTz, type Sidecar } from '../../src/lib/market.ts'
import { assertReadOnly, createClient, fundingFees, userTrades, type Client } from './binance.ts'
import { findPosition, isPlaceholder, round, setField } from './position.ts'

const ROOT = join(import.meta.dirname, '../..')
const ENV_FILE = join(ROOT, '.env.local')
const TOLERANCE = 10 * 6e4 // 记录的进场时间只到分钟，往前放宽 10 分钟
const LOOKAHEAD = 14 * 864e5 // 从进场起最多往后查 14 天
const SYNC_FIELDS = ['size', 'pnl', 'fees'] as const

function tradeFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f)) out.push(p)
    }
  }
  walk(join(ROOT, 'journal/trades'))
  return out.sort()
}

const idOf = (file: string) => file.split('/').pop()!.replace(/\.md$/, '')

/** frontmatter 某行的值和注释 */
function fieldLine(raw: string, field: string): { value: string; comment: string } | null {
  const m = new RegExp(`^${field}:(.*)$`, 'm').exec(raw.slice(0, raw.indexOf('\n---', 3)))
  if (!m) return null
  const hash = m[1].indexOf('#')
  return {
    value: (hash < 0 ? m[1] : m[1].slice(0, hash)).trim(),
    comment: hash < 0 ? '' : m[1].slice(hash + 1).trim(),
  }
}

function isPending(raw: string): boolean {
  if (splitFrontmatter(raw).data.status !== 'closed') return false
  return SYNC_FIELDS.some((f) => {
    const line = fieldLine(raw, f)
    return line !== null && isPlaceholder(line.value, line.comment)
  })
}

const fmt = (ms: number | null, tz: string) => {
  if (ms === null) return '仍持仓'
  const sign = tz.startsWith('-') ? -1 : 1
  const [h, m] = tz.slice(1).split(':').map(Number)
  return new Date(ms + sign * (h * 60 + m) * 6e4).toISOString().slice(0, 19).replace('T', ' ')
}
const signed = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`

async function syncOne(client: Client, file: string, write: boolean, prices: boolean): Promise<void> {
  const id = idOf(file)
  let raw = readFileSync(file, 'utf8')
  const trade = parseTrade(id, raw)
  const sidecarFile = join(ROOT, 'journal/charts', `${id}.json`)
  const sidecar: Sidecar = existsSync(sidecarFile) ? JSON.parse(readFileSync(sidecarFile, 'utf8')) : {}
  const symbol = binanceSymbol(trade, sidecar)
  const tz = tradeTz(trade, sidecar)

  console.log(`\n== ${id}（${symbol}，${trade.direction === 'long' ? '多' : '空'}，时间按 ${tz}）`)
  if (trade.direction !== 'long' && trade.direction !== 'short') {
    console.log('   跳过：缺少 direction')
    return
  }
  const from = trade.time ? parseTime(`${trade.date} ${trade.time}`, tz) - TOLERANCE : parseTime(`${trade.date} 00:00`, tz)
  if (!trade.time) console.log('   提示：没有 time 字段，从当天 00:00 起找第一笔开仓成交')
  const to = Math.min(Date.now(), from + LOOKAHEAD)

  const fills = await userTrades(client, symbol, from, to)
  const pos = findPosition(fills, trade.direction, from)
  if (!pos) {
    console.log(`   没找到 ${fmt(from, tz)} 之后的开仓成交（Binance 只能查最近约 6 个月的成交）`)
    return
  }

  const funding = await fundingFees(client, symbol, pos.openTime, pos.closeTime ?? Date.now())
  const usdtFees = pos.commissionAssets.every((a) => a === 'USDT')
  const pnl = pos.realizedPnl - (usdtFees ? pos.commission : 0) + funding

  console.log(`   成交 ${pos.fills.length} 笔：开仓 ${fmt(pos.openTime, tz)} → 平仓 ${fmt(pos.closeTime, tz)}`)
  console.log(`   数量 ${round(pos.size, 6)}，开仓均价 ${round(pos.entry, 6)}（日志 ${trade.entry ?? '空'}），平仓均价 ${pos.exit === null ? '—' : round(pos.exit, 6)}（日志 ${trade.exit ?? '空'}）`)
  console.log(`   已实现 ${signed(pos.realizedPnl)}，手续费 ${pos.commission.toFixed(4)} ${pos.commissionAssets.join('/')}，资金费 ${signed(funding, 4)}`)
  console.log(`   扣费后盈亏 ${signed(pnl)} USDT（日志 ${trade.pnl ?? '空'}）`)
  if (!usdtFees) console.log('   注意：手续费不全是 USDT（可能用 BNB 抵扣），盈亏里没有扣手续费，fees 不写入')
  if (pos.closeTime === null) {
    console.log('   仓位还没平完，不写入')
    return
  }

  const note = 'Binance 成交记录'
  const updates: [string, number, string, string?][] = [
    ['size', round(pos.size, 6), note],
    ['pnl', round(pnl, 2), `${note}：已实现 ${signed(pos.realizedPnl)} − 手续费 ${pos.commission.toFixed(2)}${funding ? ` ${funding >= 0 ? '+' : '−'} 资金费 ${Math.abs(funding).toFixed(2)}` : ''}`],
  ]
  if (usdtFees) updates.push(['fees', round(pos.commission, 4), `${note}：手续费 USDT`, 'pnl'])
  // entry / exit 参与 R 的计算：默认只在空着时填；--prices 时用成交均价覆盖，原值留在注释里
  const priceFields = new Set<string>()
  if (prices || trade.entry == null) {
    updates.push(['entry', round(pos.entry, 4), `${note}：开仓均价`])
    priceFields.add('entry')
  }
  if ((prices || trade.exit == null) && pos.exit !== null) {
    updates.push(['exit', round(pos.exit, 4), `${note}：平仓均价`])
    priceFields.add('exit')
  }

  const changes: string[] = []
  for (const [field, value, n, after] of updates) {
    const u = setField(raw, field, value, n, after, priceFields.has(field))
    if (u.changed) {
      raw = u.raw
      changes.push(`${field}: ${u.previous || '空'} → ${value}`)
    } else if (u.reason === `没有 ${field} 字段`) {
      changes.push(`${field}: 文件里没有这个字段，没写（值 ${value}）`)
    }
  }
  if (!changes.length) {
    console.log('   没有需要改的字段')
    return
  }
  console.log(`   ${write ? '已写入' : '将写入（加 --write 生效）'}：\n     ${changes.join('\n     ')}`)
  if (write) writeFileSync(file, raw)
}

async function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const prices = args.includes('--prices')
  const ids = args.filter((a) => !a.startsWith('--'))
  if (!ids.length && !args.includes('--pending')) {
    console.error('用法：pnpm trade:sync <交易 id ...> [--prices] [--write]，或 pnpm trade:sync --pending [--prices] [--write]')
    process.exit(1)
  }

  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
  const key = process.env.BINANCE_API_KEY
  const secret = process.env.BINANCE_API_SECRET
  if (!key || !secret) {
    console.error('缺少 BINANCE_API_KEY / BINANCE_API_SECRET，请写在 .env.local（只勾「允许读取」的 Key）')
    process.exit(1)
  }

  const all = tradeFiles()
  const files = ids.length
    ? ids.map((id) => {
        const f = all.find((p) => idOf(p) === id)
        if (!f) throw new Error(`找不到交易 ${id}（journal/trades/**/${id}.md）`)
        return f
      })
    : all.filter((f) => isPending(readFileSync(f, 'utf8')))
  if (!files.length) {
    console.log('没有需要同步的交易')
    return
  }
  console.log(`同步 ${files.length} 笔：${files.map((f) => relative(ROOT, f)).join('、')}`)

  const client = createClient(key, secret)
  await assertReadOnly(client)
  for (const f of files) {
    try {
      await syncOne(client, f, write, prices)
    } catch (e) {
      console.log(`   出错：${(e as Error).message}`)
    }
  }
  if (!write) console.log('\n以上只是预览，确认无误后加 --write 写回交易文件')
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
