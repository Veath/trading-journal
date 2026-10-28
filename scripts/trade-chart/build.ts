// 用法：pnpm trade:chart <交易 id>
// 读取 journal/trades/**/<id>.md，从 Binance USDT 永续拉取公开 K 线，
// 生成日线 / 4H / 1H（可选 15m）复盘图到 journal/screenshots/<id>-<周期>.svg，并写入交易的 screenshots 字段。
// 入场 / 止损 / 目标 / 出场自动标注；EQH、信号 K 等需要判断的标注写在 journal/charts/<id>.json（可选）。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTrade } from '../../src/lib/parse.ts'
import { render, type Diagram, type Line, type Mark, type Zone } from '../diagrams/render.ts'
import {
  DEFAULT_TIMEFRAMES,
  binanceSymbol,
  fetchKlines,
  indexAt,
  offsetMs,
  parseTime,
  tradeTz,
  type Interval,
  type Sidecar,
} from '../../src/lib/market.ts'

const ROOT = join(import.meta.dirname, '../..')

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

  const symbol = binanceSymbol(trade, sidecar)
  const tz = tradeTz(trade, sidecar)
  if (!trade.time) throw new Error('交易缺少 time 字段，无法定位入场 K 线')
  const entryMs = parseTime(`${trade.date} ${trade.time}`, tz)
  const exitMs = sidecar.exitTime ? parseTime(sidecar.exitTime, tz) : undefined
  const shift = offsetMs(tz)
  const local = (ms: number) => new Date(ms + shift) // 用 UTC 方法读取即为 tz 下的时间
  const md = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const dirLabel = trade.direction === 'long' ? '做多' : '做空'

  const files: string[] = []
  for (const interval of sidecar.timeframes ?? DEFAULT_TIMEFRAMES) {
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
      candles: candles.map((c) => [c.open, c.high, c.low, c.close]),
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
