import { describe, expect, it } from 'vitest'
import { calculatePosition, EXNESS_INSTRUMENTS, formatLot, stepDecimals } from './calc'

const byId = (id: string) => EXNESS_INSTRUMENTS.find((x) => x.id === id)!

describe('calculatePosition', () => {
  it('XAUUSD 做多：以损定仓、向下取整、币安 oz 对照与多 R 速查', () => {
    const res = calculatePosition({
      spec: byId('XAUUSD'),
      riskMode: 'usd',
      riskUsd: 100,
      balanceUsd: 5000,
      stopMode: 'price',
      entry: 3000,
      stop: 2985, // 价差 15，1 手亏 $1500 -> raw = 0.06667
      target: 3030, // 2R
      leverage: 200,
    })
    expect(res.valid).toBe(true)
    expect(res.direction).toBe('long')
    expect(res.stopDistance).toBe(15)
    expect(res.lossPerLotUsd).toBe(1500)
    expect(res.rawLot).toBeCloseTo(100 / 1500, 6)
    expect(res.lotFloor).toBe(0.06)
    expect(res.lotCeil).toBe(0.07)
    expect(res.recommendedLot).toBe(0.06)
    expect(res.belowMinLot).toBe(false)
    expect(res.actualRiskFloorUsd).toBeCloseTo(90, 5)
    expect(res.actualRiskFloorPct).toBeCloseTo(1.8, 5)
    expect(res.actualRiskCeilUsd).toBeCloseTo(105, 5)
    expect(res.qtyFloor).toBeCloseTo(6, 5) // 6 oz
    expect(res.notionalUsd).toBeCloseTo(18000, 5)
    expect(res.estMarginUsd).toBeCloseTo(90, 5)
    expect(res.valuePerStepUsd).toBeCloseTo(6, 5) // 金价每动 $1 盈亏 $6
    expect(res.plannedRR).toBeCloseTo(2, 5)
    expect(res.targetProfitUsd).toBeCloseTo(180, 5)
    expect(res.splitHalf).toEqual([0.03, 0.03])
    expect(res.rLevels.map((lv) => lv.r)).toEqual([1, 1.5, 2, 3])
    expect(res.rLevels[2].price).toBeCloseTo(3030, 5)
  })

  it('XAUUSD 做空：自动识别空单方向并计算下方目标价', () => {
    const res = calculatePosition({
      spec: byId('XAUUSD'),
      riskMode: 'pct',
      balanceUsd: 10000,
      riskPct: 1, // $100
      stopMode: 'price',
      entry: 3000,
      stop: 3020, // 止损在上方 -> short
      target: 2950, // 2.5R
    })
    expect(res.valid).toBe(true)
    expect(res.direction).toBe('short')
    expect(res.lotFloor).toBe(0.05)
    expect(res.lotCeil).toBe(0.05) // 刚好整除不虚增
    expect(res.plannedRR).toBeCloseTo(2.5, 5)
    expect(res.targetProfitUsd).toBeCloseTo(250, 5)
    expect(res.splitHalf).toEqual([0.03, 0.02])
    expect(res.rLevels.some((lv) => lv.isCustom && Math.abs(lv.r - 2.5) < 1e-6)).toBe(true)
  })

  it('XAGUSD 低于最小手数时给出 belowMinLot 与最小手数风险警告', () => {
    const res = calculatePosition({
      spec: byId('XAGUSD'), // 5000 oz/lot, min 0.01 -> 50 oz
      riskMode: 'usd',
      riskUsd: 20,
      stopMode: 'price',
      entry: 32,
      stop: 31, // 0.01 手就要亏 $50 > $20
    })
    expect(res.valid).toBe(true)
    expect(res.belowMinLot).toBe(true)
    expect(res.recommendedLot).toBe(0)
    expect(res.minLotRiskUsd).toBeCloseTo(50, 5)
    expect(res.lotCeil).toBe(0.01)
    expect(res.splitHalf).toBeNull()
  })

  it('USTEC / US500 遵循指数最小手数约束（0.05 / 0.14）', () => {
    const res = calculatePosition({
      spec: byId('US500'), // 1/lot, min 0.14
      riskMode: 'usd',
      riskUsd: 10,
      stopMode: 'distance',
      stopDistanceInput: 100, // raw = 0.10 < 0.14
    })
    expect(res.valid).toBe(true)
    expect(res.lotFloor).toBe(0.1)
    expect(res.belowMinLot).toBe(true)
    expect(res.recommendedLot).toBe(0)
    expect(res.lotCeil).toBe(0.14)
    expect(res.minLotRiskUsd).toBeCloseTo(14, 5)
  })

  it('BTCUSD 与币安数量 1:1 对齐', () => {
    const res = calculatePosition({
      spec: byId('BTCUSD'),
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 90000,
      stop: 89000,
    })
    expect(res.valid).toBe(true)
    expect(res.lotFloor).toBe(0.1)
    expect(res.qtyFloor).toBeCloseTo(0.1, 6)
    expect(res.notionalUsd).toBeCloseTo(9000, 4)
  })

  it('EURUSD 按止损点数（Pips）模式计算', () => {
    const res = calculatePosition({
      spec: byId('EURUSD'), // 100,000, pip = 0.0001 -> $10/pip per lot
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'distance',
      stopDistanceInput: 20, // 20 pips -> $200/lot -> 0.50 lot
    })
    expect(res.valid).toBe(true)
    expect(res.stopPips).toBeCloseTo(20, 6)
    expect(res.lotFloor).toBe(0.5)
    expect(res.valuePerStepUsd).toBeCloseTo(5, 5) // 0.5 lot 每 pip $5
  })

  it('USDJPY（USD 为基础货币）：按止损价折算 USD 且名义价值为 lot × 100,000', () => {
    const res = calculatePosition({
      spec: byId('USDJPY'),
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 150,
      stop: 149.5, // 50 pips = 0.50 JPY -> 50,000 JPY / 149.5 = $334.448 per lot
      target: 151, // +1.00 JPY -> 100,000 JPY / 151 per lot
    })
    expect(res.valid).toBe(true)
    expect(res.lossPerLotUsd).toBeCloseTo(50000 / 149.5, 4)
    expect(res.lotFloor).toBe(0.29)
    expect(res.notionalUsd).toBeCloseTo(29000, 4)
    expect(res.targetProfitUsd).toBeCloseTo((0.29 * 100000 * 1) / 151, 4)
  })

  it('JP225（非 USD 计价指数）：使用 USDJPY 汇率折算', () => {
    const res = calculatePosition({
      spec: byId('JP225'), // contract 1, JPY, min 3
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 38500,
      stop: 38300, // 200 JPY -> $1.25 per lot @ USDJPY=160
      quotePerUsd: 160,
    })
    expect(res.valid).toBe(true)
    expect(res.lossPerLotUsd).toBeCloseTo(1.25, 6)
    expect(res.lotFloor).toBe(80)
    expect(res.recommendedLot).toBe(80)
    expect(res.notionalUsd).toBeCloseTo((80 * 38500) / 160, 4)
  })

  it('美分账户模式：1 美分手 = 0.01 标准手，同等 USD 风险手数 ×100', () => {
    const res = calculatePosition({
      spec: byId('XAUUSD'),
      centAccount: true,
      riskMode: 'usd',
      riskUsd: 10,
      stopMode: 'price',
      entry: 3000,
      stop: 2990, // 1 cent lot = 1 oz -> 1 cent lot 亏 $10 -> 1.00 cent lot
    })
    expect(res.valid).toBe(true)
    expect(res.effectiveContractSize).toBe(1)
    expect(res.lotFloor).toBe(1)
    expect(res.qtyFloor).toBeCloseTo(1, 5)
  })

  it('处理浮点精度边界（如 0.29 / 0.01、0.14 / 0.01 不被错误向下截断）', () => {
    // 0.29 * 100 * 10 = 290
    const res = calculatePosition({
      spec: byId('XAUUSD'),
      riskMode: 'usd',
      riskUsd: 290,
      stopMode: 'distance',
      stopDistanceInput: 10,
    })
    expect(res.lotFloor).toBe(0.29)
    expect(res.lotCeil).toBe(0.29)
    expect(formatLot(res.lotFloor, 0.01)).toBe('0.29')
    expect(stepDecimals(0.01)).toBe(2)
    expect(stepDecimals(0.1)).toBe(1)
  })

  it('异常输入校验：入场等于止损、目标价填反', () => {
    const same = calculatePosition({
      spec: byId('XAUUSD'),
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 3000,
      stop: 3000,
    })
    expect(same.valid).toBe(false)

    const wrongTarget = calculatePosition({
      spec: byId('XAUUSD'),
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 3000,
      stop: 2990, // long
      target: 2980, // target below entry -> invalid
    })
    expect(wrongTarget.valid).toBe(true)
    expect(wrongTarget.targetInvalid).toBe(true)
    expect(wrongTarget.plannedRR).toBeNull()
  })
})
