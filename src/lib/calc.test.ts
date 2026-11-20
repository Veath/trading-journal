import { describe, expect, it } from 'vitest'
import { calculatePosition, formatLot, inferPriceDecimals, stepDecimals } from './calc'

describe('calculatePosition', () => {
  it('合约大小 100 做多：以损定仓、向下取整、等价数量与多 R 速查', () => {
    const res = calculatePosition({
      contractSize: 100,
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
    expect(res.qtyFloor).toBeCloseTo(6, 5)
    expect(res.notionalUsd).toBeCloseTo(18000, 5)
    expect(res.estMarginUsd).toBeCloseTo(90, 5)
    expect(res.valuePerStepUsd).toBeCloseTo(6, 5)
    expect(res.plannedRR).toBeCloseTo(2, 5)
    expect(res.targetProfitUsd).toBeCloseTo(180, 5)
    expect(res.splitHalf).toEqual([0.03, 0.03])
    expect(res.rLevels.map((lv) => lv.r)).toEqual([1, 1.5, 2, 3])
    expect(res.rLevels[2].price).toBeCloseTo(3030, 5)
  })

  it('账户比例模式 + 做空：自动识别空单并计算下方目标价', () => {
    const res = calculatePosition({
      contractSize: 100,
      riskMode: 'pct',
      balanceUsd: 10000,
      riskPct: 1, // $100
      stopMode: 'price',
      entry: 3000,
      stop: 3020,
      target: 2950, // 2.5R
    })
    expect(res.valid).toBe(true)
    expect(res.direction).toBe('short')
    expect(res.lotFloor).toBe(0.05)
    expect(res.lotCeil).toBe(0.05)
    expect(res.plannedRR).toBeCloseTo(2.5, 5)
    expect(res.targetProfitUsd).toBeCloseTo(250, 5)
    expect(res.splitHalf).toEqual([0.03, 0.02])
    expect(res.rLevels.some((lv) => lv.isCustom && Math.abs(lv.r - 2.5) < 1e-6)).toBe(true)
  })

  it('低于最小手数时给出 belowMinLot 与最小手数风险警告', () => {
    const res = calculatePosition({
      contractSize: 5000,
      minLot: 0.01,
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

  it('自定义最小手数约束（如 0.14 手）', () => {
    const res = calculatePosition({
      contractSize: 1,
      minLot: 0.14,
      lotStep: 0.01,
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

  it('合约大小 1 与币安数量 1:1 对齐', () => {
    const res = calculatePosition({
      contractSize: 1,
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

  it('标准外汇（合约 100,000）按价差输入，自动以 0.0001 作为步进参考', () => {
    const res = calculatePosition({
      contractSize: 100000,
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'distance',
      stopDistanceInput: 0.002, // 20 pips
    })
    expect(res.valid).toBe(true)
    expect(res.lotFloor).toBe(0.5)
    expect(res.valueStepLabel).toBe('0.0001 (1 pip)')
    expect(res.valuePerStepUsd).toBeCloseTo(5, 5)
  })

  it('USD 基础货币（如 USDJPY）：按止损价折算 USD 且名义价值为 lot × contractSize', () => {
    const res = calculatePosition({
      contractSize: 100000,
      quoteMode: 'USD_BASE',
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 150,
      stop: 149.5,
      target: 151,
    })
    expect(res.valid).toBe(true)
    expect(res.lossPerLotUsd).toBeCloseTo(50000 / 149.5, 4)
    expect(res.lotFloor).toBe(0.29)
    expect(res.notionalUsd).toBeCloseTo(29000, 4)
    expect(res.targetProfitUsd).toBeCloseTo((0.29 * 100000 * 1) / 151, 4)
    expect(res.valueStepLabel).toBe('0.01 (1 pip)')
  })

  it('非 USD 计价（如日元计价指数）：使用汇率折算', () => {
    const res = calculatePosition({
      contractSize: 1,
      minLot: 3,
      quoteMode: 'QUOTE_FX',
      quotePerUsd: 160,
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 38500,
      stop: 38300,
    })
    expect(res.valid).toBe(true)
    expect(res.lossPerLotUsd).toBeCloseTo(1.25, 6)
    expect(res.lotFloor).toBe(80)
    expect(res.recommendedLot).toBe(80)
    expect(res.notionalUsd).toBeCloseTo((80 * 38500) / 160, 4)
  })

  it('美分账户模式：1 美分手 = 0.01 标准手，同等 USD 风险手数 ×100', () => {
    const res = calculatePosition({
      contractSize: 100,
      centAccount: true,
      riskMode: 'usd',
      riskUsd: 10,
      stopMode: 'price',
      entry: 3000,
      stop: 2990,
    })
    expect(res.valid).toBe(true)
    expect(res.effectiveContractSize).toBe(1)
    expect(res.lotFloor).toBe(1)
    expect(res.qtyFloor).toBeCloseTo(1, 5)
  })

  it('浮点精度边界与小数位推断', () => {
    const res = calculatePosition({
      contractSize: 100,
      riskMode: 'usd',
      riskUsd: 290,
      stopMode: 'distance',
      stopDistanceInput: 10,
    })
    expect(res.lotFloor).toBe(0.29)
    expect(res.lotCeil).toBe(0.29)
    expect(formatLot(res.lotFloor, 0.01)).toBe('0.29')
    expect(stepDecimals(0.01)).toBe(2)
    expect(inferPriceDecimals('3000', '2985')).toBe(2)
    expect(inferPriceDecimals('1.08520', '1.0831')).toBe(5)
    expect(inferPriceDecimals('150.123')).toBe(3)
  })

  it('异常输入校验：合约为 0、入场等于止损、目标价填反', () => {
    expect(
      calculatePosition({
        contractSize: 0,
        riskMode: 'usd',
        riskUsd: 100,
        stopMode: 'distance',
        stopDistanceInput: 10,
      }).valid,
    ).toBe(false)

    expect(
      calculatePosition({
        contractSize: 100,
        riskMode: 'usd',
        riskUsd: 100,
        stopMode: 'price',
        entry: 3000,
        stop: 3000,
      }).valid,
    ).toBe(false)

    const wrongTarget = calculatePosition({
      contractSize: 100,
      riskMode: 'usd',
      riskUsd: 100,
      stopMode: 'price',
      entry: 3000,
      stop: 2990,
      target: 2980,
    })
    expect(wrongTarget.valid).toBe(true)
    expect(wrongTarget.targetInvalid).toBe(true)
    expect(wrongTarget.plannedRR).toBeNull()
  })
})
