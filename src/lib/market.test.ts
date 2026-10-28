import { describe, expect, it } from 'vitest'
import { binanceSymbol, indexAt, newYorkOffset, offsetMs, parseTime, tradeTz, type Candle } from './market'

describe('market', () => {
  it('纽约时区随夏令时切换', () => {
    expect(newYorkOffset('2026-07-01')).toBe('-04:00')
    expect(newYorkOffset('2026-12-01')).toBe('-05:00')
  })

  it('按 tz 解析旁注时间', () => {
    expect(parseTime('2026-10-28 09:26', '+08:00')).toBe(Date.UTC(2026, 9, 28, 1, 26))
    expect(offsetMs('+08:00')).toBe(8 * 36e5)
    expect(offsetMs('-04:30')).toBe(-4.5 * 36e5)
    expect(() => offsetMs('UTC+8')).toThrow()
  })

  it('旁注 tz 优先，否则用纽约时间', () => {
    expect(tradeTz({ date: '2026-10-28' }, { tz: '+08:00' })).toBe('+08:00')
    expect(tradeTz({ date: '2026-10-28' }, {})).toBe('-04:00')
  })

  it('推断交易所代码', () => {
    expect(binanceSymbol({ symbol: 'BTC' }, {})).toBe('BTCUSDT')
    expect(binanceSymbol({ symbol: 'XAUUSDT' }, {})).toBe('XAUUSDT')
    expect(binanceSymbol({ symbol: 'BTC' }, { symbol: 'BTCUSDC' })).toBe('BTCUSDC')
  })

  it('时间定位到所在 K 线，越界取两端', () => {
    const k = (t: number): Candle => ({ t, open: 1, high: 1, low: 1, close: 1 })
    const candles = [k(0), k(100), k(200)]
    expect(indexAt(candles, 150, 100)).toBe(1)
    expect(indexAt(candles, -50, 100)).toBe(0)
    expect(indexAt(candles, 999, 100)).toBe(2)
  })
})
