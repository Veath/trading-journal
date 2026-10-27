import { describe, expect, it } from 'vitest'
import { ictDiagrams } from './ict.ts'

describe('示意图数据', () => {
  it.each(ictDiagrams.map((d) => [d.file, d] as const))('%s 的 K 线 OHLC 合法', (_, d) => {
    d.candles.forEach((c, i) => {
      if (!c) return
      const [o, h, l, cl] = c
      expect(h, `K 线 ${i} 最高价`).toBeGreaterThanOrEqual(Math.max(o, cl))
      expect(l, `K 线 ${i} 最低价`).toBeLessThanOrEqual(Math.min(o, cl))
    })
  })

  it('标注引用的 K 线下标都存在', () => {
    for (const d of ictDiagrams) {
      const n = d.candles.length
      const refs = [
        ...(d.zones ?? []).flatMap((z) => [z.from, z.to]),
        ...(d.lines ?? []).flatMap((l) => [l.from, l.to, l.labelFrom]),
        ...(d.marks ?? []).map((m) => m.at),
        ...(d.spans ?? []).flatMap((s) => [s.from, s.to]),
      ].filter((i): i is number => i != null)
      for (const i of refs) expect(i, d.file).toBeLessThan(n)
    }
  })
})
