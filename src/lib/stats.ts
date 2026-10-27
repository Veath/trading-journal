import type { Trade } from '../types'

/**
 * 核心统计。所有 R 指标只统计 status=closed 且能算出 R 的交易。
 * 指标定义详见 docs/STATS.md。
 */
export interface Stats {
  trades: number // 参与统计的已平仓交易数
  wins: number
  losses: number
  breakevens: number

  winRate: number | null // 胜率 = 盈 / (盈 + 亏)，不含保本
  winRateInclBE: number | null // 含保本的胜率 = 盈 / 全部

  avgWinR: number | null // 平均盈利 R
  avgLossR: number | null // 平均亏损 R（负数）
  payoffRatio: number | null // 盈亏比 = 平均盈利 / |平均亏损|
  breakevenWinRate: number | null // 以当前盈亏比，保本所需最低胜率 = 1 / (1 + 盈亏比)
  profitFactor: number | null // 利润因子 = 总盈利 R / |总亏损 R|
  expectancyR: number | null // 期望值 = 平均每笔 R
  totalR: number
  totalPnl: number | null // 有填写 pnl 时的账户盈亏合计

  maxDrawdownR: number // 最大回撤（R，从权益峰值回落）
  maxWinStreak: number
  maxLossStreak: number
  sqn: number | null // System Quality Number = √N × 平均R / R标准差

  avgPlannedRR: number | null // 平均计划 R:R
  avgCaptureRatio: number | null // 盈利单兑现率 = 实际 R / 计划 R:R

  planAdherence: number | null // 按计划执行率
  missed: number // 错过的符合计划的机会
}

export function closedTrades(trades: Trade[]): (Trade & { rMultiple: number })[] {
  return trades.filter((t): t is Trade & { rMultiple: number } => t.status === 'closed' && t.rMultiple != null)
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null)
const ratio = (a: number, b: number) => (b === 0 ? null : a / b)

function stdDev(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = sum(xs) / xs.length
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1))
}

function streaks(trades: Trade[]): { maxWin: number; maxLoss: number } {
  let maxWin = 0
  let maxLoss = 0
  let win = 0
  let loss = 0
  for (const t of trades) {
    // 保本单不打断连胜/连亏
    if (t.outcome === 'win') {
      win++
      loss = 0
    } else if (t.outcome === 'loss') {
      loss++
      win = 0
    }
    maxWin = Math.max(maxWin, win)
    maxLoss = Math.max(maxLoss, loss)
  }
  return { maxWin, maxLoss }
}

export interface EquityPoint {
  index: number
  id: string
  date: string
  r: number
  cumR: number
  drawdownR: number // 距历史峰值的回撤（≤ 0）
}

/** 交易需已按时间排序 */
export function equityCurve(trades: Trade[]): EquityPoint[] {
  let cum = 0
  let peak = 0
  return closedTrades(trades).map((t, index) => {
    cum += t.rMultiple
    peak = Math.max(peak, cum)
    return { index: index + 1, id: t.id, date: t.date, r: t.rMultiple, cumR: cum, drawdownR: cum - peak }
  })
}

/** 交易需已按时间排序 */
export function computeStats(trades: Trade[]): Stats {
  const closed = closedTrades(trades)
  const rs = closed.map((t) => t.rMultiple)
  const winRs = closed.filter((t) => t.outcome === 'win').map((t) => t.rMultiple)
  const lossRs = closed.filter((t) => t.outcome === 'loss').map((t) => t.rMultiple)
  const wins = winRs.length
  const losses = lossRs.length

  const avgWinR = mean(winRs)
  const avgLossR = mean(lossRs)
  const payoffRatio = avgWinR != null && avgLossR != null ? ratio(avgWinR, Math.abs(avgLossR)) : null
  const grossLoss = Math.abs(sum(lossRs))

  const sd = stdDev(rs)
  const expectancyR = mean(rs)

  const pnls = closed.map((t) => t.pnl).filter((p): p is number => typeof p === 'number')
  const planned = closed.map((t) => t.plannedRR).filter((p): p is number => p != null)
  const captures = closed
    .filter((t) => t.outcome === 'win' && t.plannedRR)
    .map((t) => t.rMultiple / t.plannedRR!)
  const withPlanFlag = closed.filter((t) => typeof t.followedPlan === 'boolean')

  const curve = equityCurve(closed)
  const { maxWin, maxLoss } = streaks(closed)

  return {
    trades: closed.length,
    wins,
    losses,
    breakevens: closed.length - wins - losses,
    winRate: ratio(wins, wins + losses),
    winRateInclBE: ratio(wins, closed.length),
    avgWinR,
    avgLossR,
    payoffRatio,
    breakevenWinRate: payoffRatio != null ? 1 / (1 + payoffRatio) : null,
    // 没有亏损单时利润因子为 Infinity，展示层处理
    profitFactor: wins === 0 && grossLoss === 0 ? null : grossLoss === 0 ? Infinity : sum(winRs) / grossLoss,
    expectancyR,
    totalR: sum(rs),
    totalPnl: pnls.length ? sum(pnls) : null,
    maxDrawdownR: Math.min(0, ...curve.map((p) => p.drawdownR)),
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    sqn: expectancyR != null && sd ? (Math.sqrt(rs.length) * expectancyR) / sd : null,
    avgPlannedRR: mean(planned),
    avgCaptureRatio: mean(captures),
    planAdherence: ratio(withPlanFlag.filter((t) => t.followedPlan).length, withPlanFlag.length),
    missed: trades.filter((t) => t.status === 'missed').length,
  }
}

export interface GroupRow {
  key: string
  stats: Stats
}

/** 按维度分组统计（setup / session / 品种 / 星期 / 评级 / 情绪 ...）；keyFn 返回数组时一笔交易计入多组 */
export function groupStats(trades: Trade[], keyFn: (t: Trade) => string | string[] | undefined | null): GroupRow[] {
  const groups = new Map<string, Trade[]>()
  for (const t of trades) {
    const raw = keyFn(t)
    const keys = Array.isArray(raw) ? raw : [raw ?? '（未填）']
    for (const k of keys.length ? keys : ['（未填）']) {
      const list = groups.get(k) ?? []
      list.push(t)
      groups.set(k, list)
    }
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, stats: computeStats(list) }))
    .filter((g) => g.stats.trades > 0)
    .sort((a, b) => b.stats.trades - a.stats.trades)
}

export interface MistakeCost {
  mistake: string
  count: number
  totalR: number
  avgR: number
}

/** 每种错误出现的次数及其带来的 R —— 「错误的代价」 */
export function mistakeCosts(trades: Trade[]): MistakeCost[] {
  const map = new Map<string, number[]>()
  for (const t of closedTrades(trades)) {
    for (const m of t.mistakes ?? []) {
      const list = map.get(m) ?? []
      list.push(t.rMultiple)
      map.set(m, list)
    }
  }
  return [...map.entries()]
    .map(([mistake, rs]) => ({ mistake, count: rs.length, totalR: sum(rs), avgR: sum(rs) / rs.length }))
    .sort((a, b) => a.totalR - b.totalR)
}

export interface Bucket {
  center: number // 该档中心 R 值，档宽 = step
  count: number
}

/** R 分布直方图：以 step 为档宽、以整档 R 值为中心（-1R 的亏损正好落在 -1 档），两端截断到 [min, max] */
export function rDistribution(trades: Trade[], step = 0.5, min = -3, max = 6): Bucket[] {
  const n = Math.round((max - min) / step) + 1
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({ center: min + i * step, count: 0 }))
  for (const t of closedTrades(trades)) {
    const i = Math.round((Math.min(max, Math.max(min, t.rMultiple)) - min) / step)
    buckets[i].count++
  }
  return buckets
}
