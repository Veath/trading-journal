// 用法：pnpm trade:chart <交易 id>
// 读取 journal/trades/**/<id>.md，从 Binance USDT 永续拉取公开 K 线，
// 生成日线 / 4H / 1H（可选 15m）复盘图到 journal/screenshots/<id>-<周期>.svg，并写入交易的 screenshots 字段。
// 入场 / 止损 / 目标 / 出场自动标注；EQH、信号 K 等需要判断的标注写在 journal/charts/<id>.json（可选）。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTrade } from '../../src/lib/parse.ts'
import { render, type Diagram, type Line, type Mark, type OHLC, type Zone } from '../diagrams/render.ts'

const ROOT = join(import.meta.dirname, '../..')

interface Candle {
  t: number // 开盘时间 ms
  ohlc: OHLC
}

/** 旁注文件中的时间写成「YYYY-MM-DD HH:mm」，按 tz 解释 */
interface Sidecar {
  symbol?: string // 交易所代码，如 BTCUSDT；默认由交易的 symbol 推断
  tz?: string // 交易时间与图表时间轴的时区偏移，如 "+08:00"；默认纽约时间（与模板约定一致）
  exitTime?: string // 平仓时间，用于确定图表右边界
  timeframes?: Interval[] // 要生成的周期，默认 1d / 4h / 1h
  intervals?: Partial<Record<Interval, IntervalSpec>>
}
interface IntervalSpec {
  zones?: (Omit<Zone, 'from' | 'to'> & { from: string; to?: string })[]
  lines?: (Omit<Line, 'from' | 'to' | 'labelFrom'> & { from: string; to?: string })[]
  marks?: (Omit<Mark, 'at'> & { at: string })[]
}

type Interval = '1d' | '4h' | '1h' | '15m'
const SETTINGS: Record<Interval, { ms: number; before: number; after: number; step: number; label: string }> = {
  '1d': { ms: 864e5, before: 30, after: 3, step: 18, label: '日线' },
  '4h': { ms: 4 * 36e5, before: 42, after: 6, step: 14, label: '4H' },
  '1h': { ms: 36e5, before: 72, after: 12, step: 10, label: '1H' },
  '15m': { ms: 15 * 6e4, before: 32, after: 32, step: 10, label: '15m' },
}

function findTradeFile(id: string): string {
  const walk = (dir: string): string | undefined => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) {
        const hit = walk(p)
        if (hit) return hit
      } else if (f === `${id}.md`) return p
    }
  }
  const file = walk(join(ROOT, 'journal/trades'))
  if (!file) throw new Error(`找不到交易 ${id}（journal/trades/**/${id}.md）`)
  return file
}

/** 纽约时区在某天的 UTC 偏移，如 "-04:00" */
function newYorkOffset(date: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')!.value // "GMT-4"
  const h = Number(name.replace('GMT', '') || 0)
  return `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`
}

const parseTime = (s: string, tz: string) => new Date(`${s.replace(' ', 'T')}:00${tz}`).getTime()

function offsetMs(tz: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz)!
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 6e4
}

async function fetchKlines(symbol: string, interval: Interval, start: number, end: number): Promise<Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${end}&limit=1000`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance 请求失败 ${res.status}：${await res.text()}`)
  const rows = (await res.json()) as [number, string, string, string, string][]
  return rows.map((r) => ({ t: r[0], ohlc: [Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4])] }))
}

/** 时间 → 所在 K 线下标 */
function indexAt(candles: Candle[], ms: number, intervalMs: number): number {
  const i = candles.findIndex((c) => ms >= c.t && ms < c.t + intervalMs)
  if (i >= 0) return i
  return ms < candles[0].t ? 0 : candles.length - 1
}

async function main() {
  const id = process.argv[2]
  if (!id) {
    console.error('用法：pnpm trade:chart <交易 id>，例如 pnpm trade:chart 2026-10-28-btc-01')
    process.exit(1)
  }
  const tradeFile = findTradeFile(id)
  const raw = readFileSync(tradeFile, 'utf8')
  const trade = parseTrade(id, raw)
  const sidecarFile = join(ROOT, 'journal/charts', `${id}.json`)
  const sidecar: Sidecar = existsSync(sidecarFile) ? JSON.parse(readFileSync(sidecarFile, 'utf8')) : {}

  const symbol = sidecar.symbol ?? (trade.symbol.endsWith('USDT') ? trade.symbol : `${trade.symbol}USDT`)
  const tz = sidecar.tz ?? newYorkOffset(trade.date)
  if (!trade.time) throw new Error('交易缺少 time 字段，无法定位入场 K 线')
  const entryMs = parseTime(`${trade.date} ${trade.time}`, tz)
  const exitMs = sidecar.exitTime ? parseTime(sidecar.exitTime, tz) : undefined
  const shift = offsetMs(tz)
  const local = (ms: number) => new Date(ms + shift) // 用 UTC 方法读取即为 tz 下的时间
  const md = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const dirLabel = trade.direction === 'long' ? '做多' : '做空'

  const files: string[] = []
  for (const interval of sidecar.timeframes ?? (['1d', '4h', '1h'] as Interval[])) {
    const cfg = SETTINGS[interval]
    const start = entryMs - cfg.before * cfg.ms
    const end = Math.min(Date.now(), (exitMs ?? Date.now()) + cfg.after * cfg.ms)
    const candles = await fetchKlines(symbol, interval, start, end)
    if (!candles.length) throw new Error(`${symbol} ${interval} 没有数据`)
    const at = (s: string) => indexAt(candles, parseTime(s, tz), cfg.ms)
    const entryIdx = indexAt(candles, entryMs, cfg.ms)
    const spec = sidecar.intervals?.[interval] ?? {}

    const lines: Line[] = []
    if (trade.target != null) lines.push({ from: entryIdx, y: trade.target, kind: 'target', label: `目标 ${trade.target}` })
    if (trade.stop != null) lines.push({ from: entryIdx, y: trade.stop, kind: 'stop', label: `止损 ${trade.stop}` })
    if (trade.entry != null) lines.push({ from: entryIdx, y: trade.entry, kind: 'entry', label: `入场 ${trade.entry}` })
    if (trade.exit != null) {
      const exitIdx = exitMs ? indexAt(candles, exitMs, cfg.ms) : candles.length - 1
      lines.push({ from: exitIdx, y: trade.exit, kind: 'neutral', label: `出场 ${trade.exit}` })
    }
    for (const l of spec.lines ?? []) lines.push({ ...l, from: at(l.from), to: l.to ? at(l.to) : undefined })

    const marks: Mark[] = [{ at: entryIdx, text: '入场', pos: trade.direction === 'short' ? 'below' : 'above' }]
    for (const m of spec.marks ?? []) marks.push({ ...m, at: at(m.at) })

    const zones: Zone[] = (spec.zones ?? []).map((z) => ({ ...z, from: at(z.from), to: z.to ? at(z.to) : undefined }))

    // 时间轴：日线每 5 根一个标签，15m 每 2 小时，其余在每天 0 点
    const xLabels = candles.flatMap((c, i) => {
      const d = local(c.t)
      if (interval === '1d') return i % 5 === 0 ? [{ at: i, text: md(d) }] : []
      if (interval === '15m') {
        if (d.getUTCMinutes() !== 0 || d.getUTCHours() % 2 !== 0) return []
        return [{ at: i, text: d.getUTCHours() === 0 ? md(d) : `${String(d.getUTCHours()).padStart(2, '0')}:00` }]
      }
      return d.getUTCHours() === 0 ? [{ at: i, text: md(d) }] : []
    })

    const diagram: Diagram = {
      file: `${id}-${interval}`,
      title: `${symbol} ${cfg.label}  ${trade.date} ${dirLabel}（UTC${tz}）`,
      candles: candles.map((c) => c.ohlc),
      zones,
      lines,
      marks,
      xLabels,
      yAxis: true,
      step: cfg.step,
    }
    const out = join(ROOT, 'journal/screenshots', `${diagram.file}.svg`)
    writeFileSync(out, render(diagram))
    files.push(`${diagram.file}.svg`)
    console.log(`${interval}: ${candles.length} 根 K 线 → journal/screenshots/${diagram.file}.svg`)
  }

  // 把生成的图加入交易的 screenshots 字段（仅处理单行数组写法）
  const merged = [...new Set([...(trade.screenshots ?? []), ...files])]
  const updated = raw.replace(/^screenshots:\s*\[[^\]\n]*\]/m, `screenshots: [${merged.join(', ')}]`)
  if (updated !== raw) {
    writeFileSync(tradeFile, updated)
    console.log(`已更新 ${tradeFile.replace(ROOT + '/', '')} 的 screenshots`)
  } else if (!files.every((f) => trade.screenshots?.includes(f))) {
    console.log(`请手动把这些文件加入 screenshots：${files.join(', ')}`)
  }
}

main().catch((e: Error) => {
  console.error(e.message)
  process.exit(1)
})
