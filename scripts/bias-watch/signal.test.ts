import { describe, expect, it } from 'vitest'
import type { Candle } from '../../src/lib/market.ts'
import { ACCEPT_BARS, evaluate, type Setup } from './signal.ts'

const M15 = 15 * 6e4
/** [high, low, close]，open 取上一根收盘 */
const bars = (rows: [number, number, number][]): Candle[] =>
  rows.map(([high, low, close], i) => ({ t: i * M15, open: rows[i - 1]?.[2] ?? close, high, low, close }))

const long: Setup = { bias: 'bullish', zone: { top: 99.88, bottom: 99.53 }, targets: [102.93, 105.04] }

describe('evaluate（偏多）', () => {
  const pre: [number, number, number][] = [
    [100.2, 100.1, 100.15],
    [100.34, 100.04, 100.25], // 摆动高点 100.34
    [100.3, 99.77, 99.86],
  ]

  it('没扫到清扫位时一直等待', () => {
    const s = evaluate(long, bars([...pre, [99.9, 99.6, 99.7]]), 0)
    expect(s.stage).toBe('waiting')
  })

  it('扫破 → 收回 → 突破摆动高点 = 信号，止损取清扫低点', () => {
    const s = evaluate(long, bars([...pre, [99.8, 99.4, 99.6], [99.95, 99.55, 99.92], [100.5, 99.9, 100.45]]), 0)
    expect(s.stage).toBe('signal')
    expect(s.extreme).toBe(99.4)
    expect(s.mssLevel).toBe(100.34)
    expect(s.entry).toBe(100.45)
    expect(s.rr![0]).toBeCloseTo((102.93 - 100.45) / (100.45 - 99.4))
  })

  it('收回但还没突破摆动高点时停在 reclaimed', () => {
    const s = evaluate(long, bars([...pre, [99.8, 99.4, 99.6], [99.95, 99.55, 99.92]]), 0)
    expect(s.stage).toBe('reclaimed')
  })

  it('收回后再创新低，回到 swept 并更新止损', () => {
    const s = evaluate(long, bars([...pre, [99.8, 99.4, 99.6], [99.95, 99.55, 99.92], [99.9, 99.3, 99.6]]), 0)
    expect(s.stage).toBe('swept')
    expect(s.extreme).toBe(99.3)
  })

  it(`扫破后连续 ${ACCEPT_BARS} 根收在下方 = 放弃`, () => {
    const below: [number, number, number][] = Array.from({ length: ACCEPT_BARS }, () => [99.5, 99.2, 99.4])
    expect(evaluate(long, bars([...pre, ...below]), 0).stage).toBe('failed')
  })

  it('没扫就收到 TP1 = 错过', () => {
    expect(evaluate(long, bars([...pre, [103, 100.2, 102.95]]), 0).stage).toBe('missed')
  })

  it('分析时间之前的清扫不算', () => {
    const cs = bars([[99.8, 99.4, 99.6], [99.95, 99.55, 99.92], [100.0, 99.7, 99.8]])
    expect(evaluate(long, cs, 2 * M15).stage).toBe('waiting')
  })
})

describe('evaluate（偏空，镜像）', () => {
  const short: Setup = { bias: 'bearish', zone: { top: 3926.13, bottom: 3918 }, targets: [3888, 3881] }

  it('扫上沿 → 收回下沿 → 跌破摆动低点 = 信号', () => {
    const s = evaluate(
      short,
      bars([
        [3915, 3905, 3912],
        [3914, 3900, 3910], // 摆动低点 3900
        [3920, 3910, 3919],
        [3930, 3915, 3922], // 扫 3926.13
        [3923, 3912, 3915], // 收回 3918 下方
        [3916, 3895, 3898], // 跌破 3900
      ]),
      0,
    )
    expect(s.stage).toBe('signal')
    expect(s.extreme).toBe(3930)
    expect(s.mssLevel).toBe(3900)
    expect(s.rr![0]).toBeCloseTo((3888 - 3898) / (3898 - 3930))
  })
})
