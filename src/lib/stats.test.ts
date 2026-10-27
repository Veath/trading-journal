import { describe, expect, it } from 'vitest'
import { classifyOutcome, computePlannedRR, computeRMultiple, parseTrade } from './parse'
import { computeStats, equityCurve, groupStats, mistakeCosts, rDistribution } from './stats'
import type { Trade } from '../types'

function trade(id: string, r: number, extra: Partial<Trade> = {}): Trade {
  return {
    id,
    date: '2026-10-01',
    symbol: 'NQ',
    direction: 'long',
    strategy: 'ICT',
    status: 'closed',
    body: '',
    rMultiple: r,
    plannedRR: null,
    outcome: classifyOutcome(r),
    weekday: 3,
    ...extra,
  }
}

describe('R 计算', () => {
  it('多单', () => {
    expect(computeRMultiple({ direction: 'long', entry: 100, stop: 90, exit: 130 } as never)).toBe(3)
  })
  it('空单', () => {
    expect(computeRMultiple({ direction: 'short', entry: 100, stop: 110, exit: 110 } as never)).toBe(-1)
  })
  it('手填 r 优先', () => {
    expect(computeRMultiple({ direction: 'long', entry: 100, stop: 90, exit: 130, r: 1.5 } as never)).toBe(1.5)
  })
  it('计划 R:R', () => {
    expect(computePlannedRR({ direction: 'short', entry: 100, stop: 105, target: 85 } as never)).toBe(3)
  })
  it('保本阈值', () => {
    expect(classifyOutcome(0.05)).toBe('breakeven')
    expect(classifyOutcome(-0.5)).toBe('loss')
  })
})

describe('parseTrade', () => {
  it('解析 frontmatter 与日期', () => {
    const t = parseTrade('x', '---\ndate: 2026-10-27\nsymbol: NQ\ndirection: long\nstrategy: ICT\nentry: 100\nstop: 95\nexit: 110\n---\n## 复盘\nok')
    expect(t.date).toBe('2026-10-27')
    expect(t.rMultiple).toBe(2)
    expect(t.outcome).toBe('win')
    expect(t.body).toBe('## 复盘\nok')
  })
  it('持仓中的单不计算 R', () => {
    const t = parseTrade('x', '---\ndate: 2026-10-27\nsymbol: NQ\ndirection: long\nstrategy: ICT\nstatus: open\nentry: 100\nstop: 95\nexit: 110\n---\n')
    expect(t.rMultiple).toBeNull()
  })
})

describe('computeStats', () => {
  // +2, -1, +3, 0, -1, -1, +2  → 3 胜 3 负 1 保本
  const trades = [2, -1, 3, 0, -1, -1, 2].map((r, i) =>
    trade(`t${i}`, r, { followedPlan: i !== 4, mistakes: i === 4 ? ['FOMO'] : [] }),
  )
  const s = computeStats(trades)

  it('胜率不含保本', () => {
    expect(s.wins).toBe(3)
    expect(s.losses).toBe(3)
    expect(s.breakevens).toBe(1)
    expect(s.winRate).toBe(0.5)
    expect(s.winRateInclBE).toBeCloseTo(3 / 7)
  })
  it('盈亏比 / 利润因子 / 期望', () => {
    expect(s.avgWinR).toBeCloseTo(7 / 3)
    expect(s.avgLossR).toBe(-1)
    expect(s.payoffRatio).toBeCloseTo(7 / 3)
    expect(s.profitFactor).toBeCloseTo(7 / 3)
    expect(s.expectancyR).toBeCloseTo(4 / 7)
    expect(s.totalR).toBe(4)
    expect(s.breakevenWinRate).toBeCloseTo(0.3)
  })
  it('回撤与连亏', () => {
    // 累计: 2,1,4,4,3,2,4 → 峰值 4 回落到 2
    expect(s.maxDrawdownR).toBe(-2)
    expect(s.maxLossStreak).toBe(2)
    expect(s.maxWinStreak).toBe(1)
  })
  it('执行纪律', () => {
    expect(s.planAdherence).toBeCloseTo(6 / 7)
    expect(mistakeCosts(trades)).toEqual([{ mistake: 'FOMO', count: 1, totalR: -1, avgR: -1 }])
  })
  it('没有亏损单时利润因子为 ∞', () => {
    expect(computeStats([trade('a', 1)]).profitFactor).toBe(Infinity)
  })
  it('空数据', () => {
    const e = computeStats([])
    expect(e.trades).toBe(0)
    expect(e.winRate).toBeNull()
    expect(e.maxDrawdownR).toBe(0)
  })
})

describe('分组 / 曲线 / 分布', () => {
  const trades = [
    trade('a', 2, { setup: 'Silver Bullet', pdArrays: ['FVG', 'OB'] }),
    trade('b', -1, { setup: 'Silver Bullet', pdArrays: ['FVG'] }),
    trade('c', 1, { setup: 'OTE' }),
  ]
  it('groupStats 支持多值字段', () => {
    const bySetup = groupStats(trades, (t) => t.setup)
    expect(bySetup[0]).toMatchObject({ key: 'Silver Bullet' })
    expect(bySetup[0].stats.totalR).toBe(1)
    const byPd = groupStats(trades, (t) => t.pdArrays)
    expect(byPd.find((g) => g.key === 'FVG')?.stats.trades).toBe(2)
    expect(byPd.find((g) => g.key === '（未填）')?.stats.trades).toBe(1)
  })
  it('equityCurve', () => {
    expect(equityCurve(trades).map((p) => p.cumR)).toEqual([2, 1, 2])
  })
  it('rDistribution 截断极值', () => {
    const b = rDistribution([trade('x', 20), trade('y', -9), trade('z', -1)])
    expect(b.at(-1)).toEqual({ center: 6, count: 1 })
    expect(b[0]).toEqual({ center: -3, count: 1 })
    expect(b.find((x) => x.center === -1)!.count).toBe(1)
  })
})
