import { describe, expect, it } from 'vitest'
import { findPosition, findProtection, setField, type AlgoOrder, type Fill } from './position.ts'

let nextId = 1
const fill = (time: number, side: 'BUY' | 'SELL', price: number, qty: number, realizedPnl = 0, commission = 0.1): Fill => ({
  id: nextId++,
  time,
  side,
  price,
  qty,
  realizedPnl,
  commission,
  commissionAsset: 'USDT',
})

describe('findPosition', () => {
  it('做空：从开仓成交累计到仓位归零', () => {
    const fills = [
      fill(50, 'BUY', 690, 1), // 更早的交易，忽略
      fill(100, 'SELL', 700, 2),
      fill(110, 'SELL', 702, 2),
      fill(200, 'BUY', 695, 3, 15.5),
      fill(210, 'BUY', 694, 1, 7),
      fill(300, 'SELL', 680, 5), // 下一笔交易
    ]
    const p = findPosition(fills, 'short', 90)!
    expect(p.fills).toHaveLength(4)
    expect(p.size).toBe(4)
    expect(p.entry).toBe(701)
    expect(p.exit).toBe(694.75)
    expect(p.openTime).toBe(100)
    expect(p.closeTime).toBe(210)
    expect(p.realizedPnl).toBe(22.5)
    expect(p.commission).toBeCloseTo(0.4)
  })

  it('做多：跳过起点之前的反向成交', () => {
    const fills = [fill(100, 'SELL', 10, 1), fill(120, 'BUY', 9, 1), fill(130, 'SELL', 11, 1, 2)]
    const p = findPosition(fills, 'long', 100)!
    expect(p.openTime).toBe(120)
    expect(p.exit).toBe(11)
    expect(p.closeTime).toBe(130)
  })

  it('还没平完时 closeTime 为空', () => {
    const p = findPosition([fill(100, 'BUY', 9, 2), fill(130, 'SELL', 11, 1)], 'long', 0)!
    expect(p.closeTime).toBeNull()
    expect(p.exit).toBe(11)
  })

  it('找不到开仓成交时返回 null', () => {
    expect(findPosition([fill(100, 'BUY', 9, 1)], 'short', 0)).toBeNull()
    expect(findPosition([fill(100, 'SELL', 9, 1)], 'short', 200)).toBeNull()
  })
})

const doc = (lines: string) => `---\ndate: 2026-11-04\n${lines}\n---\n\n## 正文\npnl: 不是 frontmatter\n`

describe('setField', () => {
  it('填空字段，注释对齐到第 26 列', () => {
    const u = setField(doc('pnl:\nsize: 1'), 'pnl', 11.14, 'Binance 成交记录')
    expect(u.changed).toBe(true)
    expect(u.raw).toContain('\npnl: 11.14               # Binance 成交记录\n')
    expect(u.raw).toContain('pnl: 不是 frontmatter') // 正文不动
  })

  it('替换标了待补或估算的值，并保留原值', () => {
    const pending = setField(doc('pnl:                     # 待补：账户实际盈亏'), 'pnl', 5, 'x')
    expect(pending.raw).toContain('pnl: 5                   # x\n')
    const est = setField(doc('pnl: 27.02               # 估算：未扣手续费'), 'pnl', 25.1, 'x')
    expect(est.changed).toBe(true)
    expect(est.previous).toBe('27.02')
    expect(est.raw).toContain('pnl: 25.1                # x（原估算 27.02）')
  })

  it('已有的值不覆盖', () => {
    const u = setField(doc('pnl: 9.3                 # 用户：实际盈利 9.3 USDT'), 'pnl', 9.1, 'x')
    expect(u.changed).toBe(false)
    expect(u.reason).toBe('已有值')
  })

  it('force 时覆盖已有值并保留原值，值相同则不改', () => {
    const u = setField(doc('exit: 3960            # 用户：移动止盈触发'), 'exit', 3960.74, 'x', undefined, true)
    expect(u.raw).toContain('exit: 3960.74            # x（原值 3960）')
    const same = setField(doc('exit: 695.33'), 'exit', 695.33, 'x', undefined, true)
    expect(same.changed).toBe(false)
  })

  it('没有该字段时插到指定字段后面', () => {
    const u = setField(doc('pnl: 5\nemotions:'), 'fees', 0.52, 'x', 'pnl')
    expect(u.changed).toBe(true)
    expect(u.raw).toContain('pnl: 5\nfees: 0.52               # x\nemotions:')
  })

  it('没有该字段、也没给插入位置时不改', () => {
    const u = setField(doc('size: 1'), 'fees', 0.5, 'x')
    expect(u.changed).toBe(false)
    expect(u.reason).toBe('没有 fees 字段')
  })
})

describe('findProtection', () => {
  const algo = (id: number, createTime: number, type: string, side: 'BUY' | 'SELL', triggerPrice: number, status = 'EXPIRED', actualOrderId: number | null = null): AlgoOrder => ({
    id,
    type,
    side,
    positionSide: side === 'SELL' ? 'LONG' : 'SHORT',
    qty: 1,
    triggerPrice,
    workingType: 'MARK_PRICE',
    status,
    actualOrderId,
    createTime,
  })
  const open = { ...fill(100, 'BUY', 100, 1), orderId: 1 }
  const close = { ...fill(500, 'SELL', 104, 1), orderId: 9 }
  const pos = findPosition([open, close], 'long', 90)!

  it('第一张止损单是初始止损，后续为移动止损；找出触发平仓的条件单', () => {
    const p = findProtection(
      [
        algo(1, -5000, 'STOP_MARKET', 'SELL', 90), // 开仓 1 秒以前的，属于更早的交易
        algo(2, 110, 'STOP_MARKET', 'SELL', 95, 'CANCELED'),
        algo(3, 120, 'TAKE_PROFIT_MARKET', 'SELL', 110),
        algo(4, 300, 'STOP_MARKET', 'SELL', 104, 'FINISHED', 9),
        algo(5, 130, 'STOP_MARKET', 'BUY', 120), // 方向不对
        algo(6, 600, 'STOP_MARKET', 'SELL', 99), // 平仓后的
      ],
      pos,
      'long',
    )
    expect(p.stop?.triggerPrice).toBe(95)
    expect(p.stops.map((o) => o.triggerPrice)).toEqual([95, 104])
    expect(p.target?.triggerPrice).toBe(110)
    expect(p.triggered?.id).toBe(4)
  })

  it('手动平仓、没有止损单', () => {
    const p = findProtection([algo(3, 120, 'TAKE_PROFIT_MARKET', 'SELL', 110)], pos, 'long')
    expect(p.stop).toBeNull()
    expect(p.triggered).toBeNull()
    expect(p.target?.triggerPrice).toBe(110)
  })
})

describe('findPosition 双向持仓', () => {
  it('反手：平多的 SELL 不算开空', () => {
    const fills = [
      { ...fill(100, 'SELL', 666, 8), positionSide: 'LONG' as const }, // 平掉上一笔多单
      { ...fill(108, 'SELL', 665.8, 10), positionSide: 'SHORT' as const },
      { ...fill(200, 'BUY', 655, 10, 100), positionSide: 'SHORT' as const },
      { ...fill(210, 'BUY', 655.5, 13), positionSide: 'LONG' as const }, // 再反手做多
    ]
    const p = findPosition(fills, 'short', 50)!
    expect(p.fills).toHaveLength(2)
    expect(p.entry).toBe(665.8)
    expect(p.exit).toBe(655)
    expect(p.closeTime).toBe(200)
  })
})
