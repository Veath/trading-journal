// 用法：pnpm bias:watch [日期] [--symbol CLUSDT] [--every 30] [--once] [--no-notify]
// 读取 journal/agent-bias/<日期>.md（默认今天），对 status 为 watching / triggered、写了 entryZone 的标的
// 轮询 Binance 永续公开 15m K 线，按 signal.ts 的模型判断阶段；阶段变化时响铃并发 macOS 通知。
// 只读，不修改任何日志文件；输出是 Agent 的看法，不是交易指令。
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAgentBias } from '../../src/lib/parse.ts'
import { INTERVALS, fetchKlines, offsetMs, parseTime } from '../../src/lib/market.ts'
import { ACCEPT_BARS, evaluate, type Setup, type SignalState, type Stage } from './signal.ts'

const ROOT = join(import.meta.dirname, '../..')
const M15 = INTERVALS['15m'].ms
const LOOKBACK = 48 // 分析时间之前多拉的 15m 根数，用来找摆动点

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.match(/^--(symbol|every)$/))

const color = (code: number) => (s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = color(32)
const red = color(31)
const yellow = color(33)
const dim = color(2)
const bold = color(1)

const STAGE_LABEL: Record<Stage, string> = {
  waiting: '等待清扫',
  swept: '已清扫',
  reclaimed: '已收回',
  signal: '信号',
  failed: '放弃',
  missed: '错过',
}

const fmtTime = (ms: number, tz: string) => new Date(ms + offsetMs(tz)).toISOString().slice(5, 16).replace('T', ' ')
const fmtR = (r: number) => `${r >= 0 ? '+' : ''}${r.toFixed(1)}R`

function describe(w: Setup, s: SignalState, tz: string): string {
  const up = w.bias === 'bullish'
  const [beyond, back, br] = up ? ['跌破', '站上', '突破'] : ['涨破', '跌回', '跌破']
  switch (s.stage) {
    case 'waiting':
      return `等 15m ${up ? '低点' : '高点'}${beyond} ${s.sweepLevel}`
    case 'swept':
      return `${fmtTime(s.extremeAt!, tz)} 扫到 ${s.extreme}；等 15m 收盘${back} ${s.reclaimLevel}` +
        (s.outsideBars ? `（已连续 ${s.outsideBars}/${ACCEPT_BARS} 根收在 ${s.sweepLevel} 外侧）` : '')
    case 'reclaimed':
      return `已收盘${back} ${s.reclaimLevel}；等 15m 收盘${br} ${s.mssLevel}（MSS）`
    case 'signal': {
      const rr = s.rr?.map((r, i) => `TP${i + 1} ${fmtR(r)}`).join('，')
      const weak = s.rr?.[0] != null && s.rr[0] < 1.5 ? red('（TP1 不到 1.5R）') : ''
      return `${fmtTime(s.signalAt!, tz)} 15m 收盘 ${s.entry} ${br} ${s.mssLevel}；示例进场 ${s.entry} / 止损 ${s.extreme}` +
        (rr ? `，${rr}` : '') + weak
    }
    case 'failed':
      return `${beyond} ${s.sweepLevel} 后连续 ${ACCEPT_BARS} 根 15m 收在外侧，价格被接受，放弃`
    case 'missed':
      return `没清扫就收到 TP1 ${w.targets?.[0]}，错过不追`
  }
}

function stageColor(stage: Stage) {
  if (stage === 'signal') return green
  if (stage === 'failed' || stage === 'missed') return red
  if (stage === 'waiting') return dim
  return yellow
}

function notify(title: string, message: string) {
  process.stdout.write('\x07')
  if (flag('no-notify') || process.platform !== 'darwin') return
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Glass"`
  execFile('osascript', ['-e', script], () => {})
}

function todayIn(tz: string) {
  return new Date(Date.now() + offsetMs(tz)).toISOString().slice(0, 10)
}

async function main() {
  const date = positional[0] ?? todayIn('+08:00')
  const file = join(ROOT, 'journal/agent-bias', `${date}.md`)
  if (!existsSync(file)) {
    console.error(`找不到 ${file}，先用 pnpm new:bias 新建，或指定日期：pnpm bias:watch 2026-11-02`)
    process.exit(1)
  }
  const day = parseAgentBias(date, readFileSync(file, 'utf8'))
  const tz = day.tz ?? '+08:00'
  const from = parseTime(`${day.date} ${day.time ?? '00:00'}`, tz)
  const only = option('symbol')?.toUpperCase()
  const every = Math.max(10, Number(option('every') ?? 30)) * 1000

  const watches = day.watch.filter((w) => !only || w.symbol.toUpperCase() === only)
  const active = watches.filter(
    (w) => (w.status === 'watching' || w.status === 'triggered') && w.entryZone && w.bias !== 'neutral',
  )
  const skipped = watches
    .filter((w) => !active.includes(w))
    .map((w) => dim(`跳过 ${w.symbol}：${w.bias === 'neutral' ? '中性' : !w.entryZone ? '没有 entryZone' : `状态 ${w.status}`}`))
  if (!active.length) {
    console.error('没有可监控的标的')
    process.exit(1)
  }

  const last = new Map<string, Stage>()
  const log: string[] = []

  const tick = async () => {
    const now = Date.now()
    const lines = [
      bold(`Agent偏见 ${day.date} 监控`) + dim(`  ${fmtTime(now, tz)}（UTC${tz}）· 每 ${every / 1000} 秒 · Ctrl+C 退出`),
      dim('只看已收盘的 15m；这是 Agent 的看法，不是交易指令。时段、日线收盘等条件见 Agent偏见原文。'),
      ...skipped,
      '',
    ]
    for (const w of active) {
      const setup: Setup = { bias: w.bias as Setup['bias'], zone: w.entryZone!, targets: w.targets }
      try {
        const candles = await fetchKlines(w.symbol, '15m', from - LOOKBACK * M15, now)
        const closed = candles.filter((c) => c.t + M15 <= now)
        const live = candles.at(-1)!
        const s = evaluate(setup, closed, from)
        const paint = stageColor(s.stage)
        const dir = w.bias === 'bullish' ? green('偏多') : red('偏空')
        lines.push(`${bold(w.symbol)} ${dir}  现价 ${bold(String(live.close))}  ${paint(`[${STAGE_LABEL[s.stage]}]`)}`)
        lines.push(`  ${paint(describe(setup, s, tz))}`)
        const pierced = w.bias === 'bullish' ? live.low < s.sweepLevel : live.high > s.sweepLevel
        if (s.stage === 'waiting' && pierced) lines.push(yellow(`  当前 15m 已刺破 ${s.sweepLevel}，收盘后才算数`))
        lines.push(dim(`  计划区 ${w.entryZone!.bottom}–${w.entryZone!.top}` +
          (w.targets?.length ? ` · 目标 ${w.targets.join(' / ')}` : '') +
          ` · 当前 15m（${fmtTime(live.t, tz)}，未收盘）高 ${live.high} 低 ${live.low}`))
        lines.push('')

        const prev = last.get(w.symbol)
        if (prev !== s.stage) {
          last.set(w.symbol, s.stage)
          const msg = `${w.symbol} ${STAGE_LABEL[s.stage]}：${describe(setup, s, tz).replace(/\x1b\[\d+m/g, '')}`
          log.push(`${fmtTime(now, tz)} ${msg}`)
          // 启动时只提醒已经出现的信号，之后每次阶段变化都提醒
          if (prev != null || s.stage === 'signal') notify(`Agent偏见 · ${w.symbol}`, msg)
        }
      } catch (e) {
        lines.push(`${bold(w.symbol)} ${red(`拉取失败：${(e as Error).message}`)}`, '')
      }
    }
    if (log.length) lines.push(bold('阶段变化'), ...log.slice(-10).map((l) => `  ${l}`))
    if (process.stdout.isTTY && !flag('once')) console.clear()
    console.log(lines.join('\n'))
  }

  await tick()
  if (flag('once')) return
  setInterval(() => void tick(), every)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
