import { describe, expect, it } from 'vitest'
import { allDiagrams } from './all.ts'
import { candlesFromCloses, closesFromPath, ema, macd, profileLevels, rsi, volumeProfile, vwap } from './calc.ts'
import type { OHLC } from './render.ts'

const diagrams = Object.values(allDiagrams).flat()

describe('示意图数据', () => {
  it.each(diagrams.map((d) => [d.file, d] as const))('%s 的 K 线 OHLC 合法', (_, d) => {
    d.candles.forEach((c, i) => {
      if (!c) return
      const [o, h, l, cl] = c
      expect(h, `K 线 ${i} 最高价`).toBeGreaterThanOrEqual(Math.max(o, cl))
      expect(l, `K 线 ${i} 最低价`).toBeLessThanOrEqual(Math.min(o, cl))
    })
  })

  it('标注引用的 K 线下标都存在', () => {
    for (const d of diagrams) {
      const n = d.candles.length
      const refs = [
        ...(d.zones ?? []).flatMap((z) => [z.from, z.to]),
        ...(d.lines ?? []).flatMap((l) => [l.from, l.to, l.labelFrom]),
        ...(d.marks ?? []).map((m) => m.at),
        ...(d.spans ?? []).flatMap((s) => [s.from, s.to]),
        ...[...(d.segments ?? []), ...(d.panel?.segments ?? [])].flatMap((s) => [s.from[0], s.to[0]]),
        ...(d.panel?.marks ?? []).map((m) => m.at),
        ...(d.profile ? [d.profile.from, d.profile.to] : []),
      ].filter((i): i is number => i != null)
      for (const i of refs) expect(i, d.file).toBeLessThan(n)
    }
  })

  it('指标序列与 K 线等长', () => {
    for (const d of diagrams) {
      for (const s of d.series ?? []) expect(s.values.length, d.file).toBe(d.candles.length)
      if (d.panel) expect(d.panel.values.length, d.file).toBe(d.candles.length)
    }
  })
})

describe('指标计算', () => {
  const candles: OHLC[] = [
    [10, 12, 9, 11],
    [11, 13, 10, 12],
    [12, 12.5, 10.5, 11],
  ]

  it('RSI：只涨为 100，只跌为 0，前 period 根为 NaN', () => {
    const up = Array.from({ length: 6 }, (_, i): OHLC => [i, i + 1, i, i + 1])
    expect(rsi(up, 3).slice(0, 3).every(Number.isNaN)).toBe(true)
    expect(rsi(up, 3).slice(3)).toEqual([100, 100, 100])
    const down = up.map(([o, h, l, c]): OHLC => [-o, -l, -h, -c])
    expect(rsi(down, 3).slice(3)).toEqual([0, 0, 0])
  })

  it('RSI：Wilder 平滑', () => {
    // 涨跌：+1 -1 +2 → 首个平均（n=2）：up 0.5、down 0.5；之后 up = (0.5 + 2) / 2 = 1.25，down = 0.25
    const c: OHLC[] = [10, 11, 10, 12].map((v): OHLC => [v, v, v, v])
    expect(rsi(c, 2)).toEqual([NaN, NaN, 50, 83.3])
  })

  it('VWAP：成交量加权的典型价', () => {
    const v = vwap(candles, [1, 3, 0])
    const tp = candles.map(([, h, l, c]) => (h + l + c) / 3)
    expect(v.vwap[0]).toBeCloseTo(tp[0])
    expect(v.vwap[1]).toBeCloseTo((tp[0] + 3 * tp[1]) / 4)
    expect(v.vwap[2]).toBeCloseTo(v.vwap[1]) // 0 成交量不影响
    expect(v.sd[0]).toBe(0)
    expect(v.sd[1]).toBeCloseTo(Math.sqrt((1 * (tp[0] - v.vwap[1]) ** 2 + 3 * (tp[1] - v.vwap[1]) ** 2) / 4))
  })

  it('Volume Profile：成交量按价格均匀分摊，Value Area 覆盖 70%', () => {
    const c: OHLC[] = [
      [0, 4, 0, 4], // 4 行各 1
      [1, 2, 1, 2], // 全部在第 2 行
    ]
    const p = volumeProfile(c, [4, 5], 0, 1, 1)
    expect(p.rows.map((r) => r.volume)).toEqual([1, 6, 1, 1])
    expect(p.poc).toBe(1)
    expect(p.va).toEqual([1, 2]) // 6 < 9 × 70%，上下相邻行相等时先并入上方：6 + 1 = 7 ≥ 6.3
    expect(profileLevels(p)).toEqual({ poc: 1.5, vah: 3, val: 1 })
  })

  it('EMA：SMA 初值，之后 α = 2 / (n + 1)', () => {
    // n = 3，α = 0.5：初值 (1 + 2 + 3) / 3 = 2，之后 0.5 × 6 + 0.5 × 2 = 4
    expect(ema([1, 2, 3, 6], 3)).toEqual([NaN, NaN, 2, 4])
    // warmup 不出现在输出中，但参与计算
    expect(ema([6], 3, [1, 2, 3])).toEqual([4])
  })

  it('MACD：柱状图 = MACD − Signal，常数价格时全为 0', () => {
    const flat = Array.from({ length: 50 }, (): OHLC => [10, 10, 10, 10])
    const m = macd(flat)
    expect(m.macd.slice(40)).toEqual(Array(10).fill(0))
    expect(m.histogram.slice(40)).toEqual(Array(10).fill(0))
    const up = candlesFromCloses(closesFromPath([[0, 10], [49, 30]]), 10)
    const mu = macd(up)
    expect(mu.macd[49]).toBeGreaterThan(0)
    mu.histogram.forEach((h, i) => Number.isNaN(h) || expect(h).toBeCloseTo(mu.macd[i] - mu.signal[i]))
  })
})
