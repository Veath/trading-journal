import { describe, expect, it } from 'vitest'
import { parseAgentBias, plannedRR } from './parse'

describe('parseAgentBias', () => {
  it('解析当天的标的，status 默认 watching，日期默认取文件名', () => {
    const d = parseAgentBias('2026-10-30', '---\nwatch:\n  - { symbol: CLUSDT, bias: bullish }\n  - { symbol: SPYUSDT, bias: bullish, status: expired }\n---\n\n结论')
    expect(d.date).toBe('2026-10-30')
    expect(d.body).toBe('结论')
    expect(d.watch.map((w) => w.status)).toEqual(['watching', 'expired'])
  })

  it('没有 watch 时返回空列表', () => {
    expect(parseAgentBias('2026-10-30', '---\ndate: 2026-10-30\n---\n').watch).toEqual([])
  })
})

describe('plannedRR', () => {
  it('按目标距离 / 止损距离计算，缺价格或止损距离为 0 时返回 null', () => {
    expect(plannedRR(103.4, 102.4, 105.11)).toBeCloseTo(1.71)
    expect(plannedRR(undefined, 102.4, 105.11)).toBeNull()
    expect(plannedRR(100, 100, 105)).toBeNull()
  })
})
