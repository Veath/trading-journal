// RSI 示意图数据。价格为示意单位；RSI 由 calc.ts 按 Wilder 公式从收盘价算出，warmup 为图上不显示的前置收盘价。
import { rsi } from './calc.ts'
import type { Diagram, OHLC } from './render.ts'

// 下跌 → 扫前低（SSL）→ 位移：价格更低的低点，RSI 更高的低点
const divCandles: OHLC[] = [
  [62, 62.5, 59.5, 60],
  [60, 60.5, 56, 56.5],
  [56.5, 57, 52.5, 53],
  [53, 53.5, 49.5, 50], // 3 低点 A
  [50, 53, 49.8, 52.5],
  [52.5, 54.5, 52, 54],
  [54, 55, 53, 53.5], // 6 短期高点 55
  [53.5, 54, 52, 52.5],
  [52.5, 53, 51, 51.5],
  [51.5, 52, 50, 50.5],
  [50.5, 51, 48.5, 49.5], // 10 低点 B：扫掉 A
  [49.5, 50.5, 49, 50],
  [50, 56, 49.8, 55.5], // 12 位移收在 55 上方 → MSS
  [55.5, 57.5, 55, 57],
  [57, 58, 55.5, 56],
  [56, 59.5, 55.8, 59],
]
const divRsi = rsi(divCandles, 14, [60, 61, 60.5, 61.5, 61, 62, 61.5, 62, 61, 61.5, 62, 61, 61.5, 62])

// 上升趋势：回撤时 RSI 守在 40 上方，高点反复进入 70 以上
const trendCandles: OHLC[] = [
  [51.5, 53.5, 51, 53],
  [53, 55.5, 52.5, 55],
  [55, 57.5, 54.5, 57],
  [57, 57.5, 54.5, 55],
  [55, 55.5, 53, 53.5],
  [53.5, 54, 52.2, 52.8], // 5 回撤低点
  [52.8, 56, 52.5, 55.5],
  [55.5, 58.5, 55, 58],
  [58, 61, 57.5, 60.5],
  [60.5, 61, 58, 58.5],
  [58.5, 59, 56.5, 57],
  [57, 57.5, 55.6, 56.2], // 11 回撤低点
  [56.2, 59.5, 56, 59],
  [59, 62.5, 58.5, 62],
  [62, 65.5, 61.5, 65],
  [65, 65.5, 62.5, 63],
  [63, 63.5, 61, 61.5],
  [61.5, 62, 60, 60.6], // 17 回撤低点
  [60.6, 64, 60.3, 63.5],
  [63.5, 67.5, 63, 67],
]
const trendRsi = rsi(trendCandles, 14, [51.5, 51.9, 51.3, 51.8, 51.2, 51.7, 51.1, 51.8, 51.3, 51.9, 51.2, 51.7, 51.3, 51.6])

// 顶部 Failure Swing：RSI 上 70 → 回落 → 反弹不过 70 → 跌破回落低点
const fsCandles: OHLC[] = [
  [55, 56.5, 54.5, 56],
  [56, 58, 55.5, 57.5],
  [57.5, 60, 57, 59.5],
  [59.5, 62, 59, 61.5], // 3 RSI 上 70
  [61.5, 62.5, 60.5, 61],
  [61, 61.5, 59, 59.5],
  [59.5, 60, 58, 58.5], // 6 RSI 回落低点
  [58.5, 60.5, 58, 60],
  [60, 62.3, 59.5, 61.8], // 8 RSI 反弹未过 70
  [61.8, 62.8, 61, 61.5],
  [61.5, 62, 59.5, 60],
  [60, 60.5, 57, 57.5], // 11 RSI 跌破回落低点
  [57.5, 58, 55, 55.5],
  [55.5, 57, 54.5, 56.5],
  [56.5, 57, 53, 53.5],
]
const fsRsi = rsi(fsCandles, 14, [55, 55.4, 54.8, 55.3, 54.7, 55.2, 54.6, 55.3, 54.8, 55.4, 54.7, 55.2, 54.8, 55.1])

export const rsiDiagrams: Diagram[] = [
  {
    file: 'rsi-divergence',
    title: '常规看涨背离：价格扫 SSL 创新低，RSI 低点抬高',
    candles: divCandles,
    lines: [
      { from: 3, to: 10, y: 49.5, label: 'SSL', labelFrom: 4 },
      { from: 6, to: 12, y: 55, label: 'MSS' },
    ],
    segments: [{ from: [3, 49.5], to: [10, 48.5], label: '价格：更低的低点', labelPos: 'below' }],
    marks: [
      { at: 10, text: '扫 SSL', pos: 'below' },
      { at: 12, text: '位移', pos: 'above' },
    ],
    panel: {
      title: 'RSI(14)',
      values: divRsi,
      min: 10,
      max: 80,
      levels: [
        { y: 70, label: '70' },
        { y: 30, label: '30' },
      ],
      segments: [{ from: [3, divRsi[3]], to: [10, divRsi[10]], label: 'RSI：更高的低点', labelPos: 'below' }],
    },
  },
  {
    file: 'rsi-range-shift',
    title: '区间切换：上升趋势中 RSI 在 40–80 运行，回撤守住 40',
    candles: trendCandles,
    marks: [
      { at: 5, text: 'HL', pos: 'below' },
      { at: 11, text: 'HL', pos: 'below' },
      { at: 17, text: 'HL', pos: 'below' },
    ],
    panel: {
      title: 'RSI(14)',
      values: trendRsi,
      min: 20,
      max: 90,
      band: { top: 80, bottom: 40, label: '牛市区间 40–80' },
      levels: [
        { y: 70, label: '70' },
        { y: 30, label: '30' },
      ],
      marks: [
        { at: 5, text: '回撤', pos: 'below' },
        { at: 11, text: '回撤', pos: 'below' },
        { at: 17, text: '回撤', pos: 'below' },
      ],
    },
  },
  {
    file: 'rsi-failure-swing',
    title: '顶部 Failure Swing：RSI 反弹不过 70，随后跌破前一个低点',
    candles: fsCandles,
    marks: [{ at: 11, text: '卖出信号', pos: 'below' }],
    panel: {
      title: 'RSI(14)',
      values: fsRsi,
      min: 35,
      max: 100,
      levels: [{ y: 70, label: '70' }],
      segments: [{ from: [6, fsRsi[6]], to: [11, fsRsi[6]], label: 'RSI 回落低点', labelPos: 'below' }],
      marks: [
        { at: 3, text: '上 70', pos: 'above' },
        { at: 8, text: '未过 70', pos: 'above' },
        { at: 11, text: '跌破', pos: 'below' },
      ],
    },
  },
]
