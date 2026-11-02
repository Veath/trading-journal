// Agent偏见的信号判断（纯函数，只看已收盘的 15m K 线）。
// 模型是「扫计划区外侧 → 收回内侧 → MSS」：
//   偏多：15m 低点跌破 entryZone.bottom（清扫）→ 15m 收盘站上 entryZone.top（收回）
//         → 15m 收盘突破清扫低点之前最近的摆动高点（MSS）= 信号
//   偏空：上下镜像
// 清扫后连续 ACCEPT_BARS 根收在清扫位外侧 = 价格被接受，放弃；没扫就收到 TP1 = 错过。
import type { Candle } from '../../src/lib/market.ts'

export type Stage = 'waiting' | 'swept' | 'reclaimed' | 'signal' | 'failed' | 'missed'

export interface Setup {
  bias: 'bullish' | 'bearish'
  zone: { top: number; bottom: number }
  targets?: number[]
}

export interface SignalState {
  stage: Stage
  sweepLevel: number
  reclaimLevel: number
  extreme?: number // 清扫出的极值（偏多为最低点），也是示例止损
  extremeAt?: number
  mssLevel?: number
  signalAt?: number
  entry?: number // 信号 K 收盘价
  rr?: number[] // 按 entry / extreme 算的各目标 R
  outsideBars: number // 清扫后连续收在清扫位外侧的根数
}

export const ACCEPT_BARS = 4

/** 偏空时把价格取反，复用偏多的逻辑 */
const flip = (c: Candle): Candle => ({ t: c.t, open: -c.open, high: -c.low, low: -c.high, close: -c.close })

/** 下标 end 之前最近的摆动高点（左右各 1 根）；找不到就取之前的最高点 */
function lastSwingHigh(candles: Candle[], end: number): number {
  for (let j = end - 1; j >= 1; j--) {
    if (candles[j].high >= candles[j - 1].high && candles[j].high >= candles[j + 1].high) return candles[j].high
  }
  return Math.max(...candles.slice(0, end + 1).map((c) => c.high))
}

/**
 * candles：按时间排序的已收盘 15m K 线，需包含分析时间之前的一段（用来找 MSS 摆动高点）；
 * from：分析时间，之前的 K 线只用来找摆动点，不触发阶段变化。
 */
export function evaluate(setup: Setup, candles: Candle[], from: number): SignalState {
  const bear = setup.bias === 'bearish'
  const cs = bear ? candles.map(flip) : candles
  const sweep = bear ? -setup.zone.top : setup.zone.bottom
  const reclaim = bear ? -setup.zone.bottom : setup.zone.top
  const tp1 = setup.targets?.[0] == null ? undefined : bear ? -setup.targets[0] : setup.targets[0]

  let stage: Stage = 'waiting'
  let extreme: number | undefined
  let extremeAt: number | undefined
  let mss: number | undefined
  let signal: Candle | undefined
  let outside = 0

  for (let i = 0; i < cs.length && (stage === 'waiting' || stage === 'swept' || stage === 'reclaimed'); i++) {
    const c = cs[i]
    if (c.t < from) continue
    if (stage === 'waiting') {
      if (c.low < sweep) stage = 'swept'
      else if (tp1 != null && c.close >= tp1) {
        stage = 'missed'
        break
      } else continue
    }
    if (extreme == null || c.low < extreme) {
      extreme = c.low
      extremeAt = c.t
      mss = Math.max(lastSwingHigh(cs, i), reclaim)
      if (stage === 'reclaimed') stage = 'swept'
    }
    outside = c.close < sweep ? outside + 1 : 0
    if (outside >= ACCEPT_BARS) {
      stage = 'failed'
      break
    }
    if (stage === 'swept' && c.close > reclaim) stage = 'reclaimed'
    if (stage === 'reclaimed' && c.close > mss!) {
      stage = 'signal'
      signal = c
    }
  }

  const back = (n: number | undefined) => (n == null ? undefined : bear ? -n : n)
  const entry = back(signal?.close)
  const stop = back(extreme)
  return {
    stage,
    sweepLevel: back(sweep)!,
    reclaimLevel: back(reclaim)!,
    extreme: stop,
    extremeAt,
    mssLevel: back(mss),
    signalAt: signal?.t,
    entry,
    rr: entry != null && stop != null && entry !== stop ? setup.targets?.map((t) => (t - entry) / (entry - stop)) : undefined,
    outsideBars: outside,
  }
}
