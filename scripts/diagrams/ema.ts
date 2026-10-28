// EMA 示意图数据。K 线由收盘价路径生成（calc.ts 的 closesFromPath / candlesFromCloses），价格为示意单位；
// EMA(21 / 55 / 100 / 200) 由 calc.ts 算出，warmup 为图上不显示的 220 根前置收盘价，让 200 EMA 有足够历史。
import { candlesFromCloses, closesFromPath, ema } from './calc.ts'
import type { Diagram, Series } from './render.ts'

const PERIODS = [21, 55, 100, 200] as const
const warmup = closesFromPath([[0, 85], [220, 98]], 0.8)

function emaSeries(closes: number[]): Series[] {
  return PERIODS.map((n, i) => ({ values: ema(closes, n, warmup), label: `EMA ${n}`, kind: `ema${i + 1}` as Series['kind'] }))
}

// 多头排列：21 > 55 > 100 > 200，浅回撤到 21、深回撤到 55 后继续上涨
const stackCloses = closesFromPath([[0, 99], [8, 106], [12, 101.9], [20, 111], [28, 102.2], [40, 118]], 0.6)

// 排列转换：跌破 21 / 55 → 21 下穿 55 → 反抽 EMA 被拒绝 → 跌破 200
const flipCloses = closesFromPath([[0, 99], [10, 106], [16, 104], [22, 108], [34, 96], [40, 99.5], [54, 90]], 0.6)

export const emaDiagrams: Diagram[] = [
  {
    file: 'ema-stack',
    title: '多头排列：21 > 55 > 100 > 200，回撤到 21 / 55 后延续',
    candles: candlesFromCloses(stackCloses, warmup.at(-1)!),
    series: emaSeries(stackCloses),
    step: 18,
    marks: [
      { at: 12, text: '回踩 21', pos: 'below' },
      { at: 28, text: '回踩 55', pos: 'below' },
    ],
  },
  {
    file: 'ema-flip',
    title: '排列转换：跌破 21 / 55，21 下穿 55，反抽被拒绝，再跌破 200',
    candles: candlesFromCloses(flipCloses, warmup.at(-1)!),
    series: emaSeries(flipCloses),
    step: 16,
    marks: [
      { at: 22, text: '顶部', pos: 'above' },
      { at: 36, text: '21 下穿 55', pos: 'below' },
      { at: 40, text: '反抽被拒绝', pos: 'above' },
      { at: 48, text: '跌破 200', pos: 'below' },
    ],
  },
]
