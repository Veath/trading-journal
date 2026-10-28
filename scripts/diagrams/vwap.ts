// VWAP 示意图数据。价格和成交量为示意单位；VWAP 与标准差带由 calc.ts 从 K 线 + 成交量算出。
import { vwap, vwapBand } from './calc.ts'
import type { Diagram, OHLC, Series } from './render.ts'

// 前两根 K 线的标准差几乎为 0，带从第 3 根开始画
const fromBar = (values: number[], start = 2) => values.map((v, i) => (i < start ? null : v))

function vwapSeries(candles: OHLC[], volumes: number[], ks: number[]): Series[] {
  const v = vwap(candles, volumes)
  return [
    { values: v.vwap, label: 'VWAP', kind: 'main' },
    ...ks.map((k): Series => ({ values: fromBar(vwapBand(v, k)), label: `${k > 0 ? '+' : '−'}${Math.abs(k)}σ`, kind: 'band' })),
  ]
}

// 趋势日：开盘推动后一直在 VWAP 上方，回踩 VWAP / +1σ 即结束
const trendCandles: OHLC[] = [
  [50, 51.5, 49, 51],
  [51, 53.5, 50.5, 53],
  [53, 55.5, 52.5, 55],
  [55, 56, 53.5, 54],
  [54, 54.5, 52.5, 53], // 4 回踩 VWAP
  [53, 56, 52.8, 55.5],
  [55.5, 58, 55, 57.5],
  [57.5, 59.5, 57, 59],
  [59, 59.5, 57, 57.5],
  [57.5, 58, 57, 57.3], // 9 回踩 +1σ
  [57.3, 59, 57.1, 58.5],
  [58.5, 61, 58, 60.5],
  [60.5, 62.5, 60, 62],
  [62, 62.5, 60, 60.5],
  [60.5, 61, 59.2, 59.6], // 14 回踩 +1σ
  [59.6, 62, 59.4, 61.5],
  [61.5, 64, 61, 63.5],
  [63.5, 65, 63, 64.5],
]
const trendVolumes = [9, 8, 7, 5, 5, 6, 5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3]

// 均值回归日：VWAP 走平，价格在 ±2σ 被拒绝后回到 VWAP
const balanceCandles: OHLC[] = [
  [50, 51.5, 48.5, 51],
  [51, 52, 49.5, 49.8],
  [49.8, 50.5, 48, 48.5],
  [48.5, 50.5, 48.2, 50.2],
  [50.2, 52, 50, 51.8],
  [51.8, 53.8, 51.5, 53.5], // 5 触及 +2σ
  [53.5, 54.2, 52, 52.3],
  [52.3, 52.5, 50.2, 50.5],
  [50.5, 51, 49.5, 50], // 8 回到 VWAP
  [50, 50.5, 48.2, 48.5],
  [48.5, 48.8, 46.5, 46.8], // 10 触及 −2σ
  [46.8, 48.5, 46.3, 48.2],
  [48.2, 49.8, 48, 49.6],
  [49.6, 50.8, 49.3, 50.5], // 13 回到 VWAP
  [50.5, 52, 50.2, 51.6],
  [51.6, 53.9, 51.2, 53.2], // 15 触及 +2σ
  [53.2, 53.8, 51.6, 51.9],
  [51.9, 52.2, 50, 50.3],
]
const balanceVolumes = [8, 6, 6, 5, 5, 6, 6, 5, 4, 4, 6, 6, 4, 4, 4, 5, 5, 4]

export const vwapDiagrams: Diagram[] = [
  {
    file: 'vwap-trend-day',
    title: '趋势日：价格运行在 VWAP 上方，回踩 VWAP / +1σ 即结束',
    candles: trendCandles,
    series: vwapSeries(trendCandles, trendVolumes, [2, 1, -1]),
    marks: [
      { at: 4, text: '回踩 VWAP', pos: 'below' },
      { at: 9, text: '回踩 +1σ', pos: 'below' },
      { at: 14, text: '回踩 +1σ', pos: 'below' },
    ],
  },
  {
    file: 'vwap-balance-day',
    title: '均值回归日：VWAP 走平，±2σ 被拒绝后回到 VWAP',
    candles: balanceCandles,
    series: vwapSeries(balanceCandles, balanceVolumes, [2, 1, -1, -2]),
    marks: [
      { at: 5, text: '+2σ 拒绝', pos: 'above' },
      { at: 8, text: '回到 VWAP', pos: 'below' },
      { at: 10, text: '−2σ 拒绝', pos: 'below' },
      { at: 15, text: '+2σ 拒绝', pos: 'above' },
    ],
  },
]
