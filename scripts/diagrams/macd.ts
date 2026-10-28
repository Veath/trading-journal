// MACD 示意图数据。K 线由收盘价路径生成，价格为示意单位；MACD(12, 26, 9) 由 calc.ts 算出，
// warmup 为图上不显示的 40 根前置收盘价。
import { candlesFromCloses, closesFromPath, macd } from './calc.ts'
import type { Diagram, Panel } from './render.ts'

const warmup = closesFromPath([[0, 50], [40, 50]], 0.4)

function macdPanel(m: ReturnType<typeof macd>, extra: Partial<Panel>): Panel {
  const all = [...m.macd, ...m.signal, ...m.histogram].filter((v) => !Number.isNaN(v))
  const pad = 0.2
  return {
    title: 'MACD(12, 26, 9)：MACD 线（灰）· Signal（橙）· 柱状图',
    values: m.macd,
    signal: m.signal,
    histogram: m.histogram,
    min: Math.min(...all) - pad,
    max: Math.max(...all) + pad,
    levels: [{ y: 0, label: '0 轴' }],
    ...extra,
  }
}

// 上涨 → 横盘（动能衰减）→ 下跌：金叉、柱体缩短、死叉、下穿 0 轴
const basicCandles = candlesFromCloses(closesFromPath([[0, 50], [3, 49], [14, 58], [18, 56], [22, 57], [34, 47], [40, 50]], 0.3), warmup.at(-1)!)
const basicMacd = macd(basicCandles, warmup)

// 看跌背离：价格扫前高（BSL）创新高，MACD 高点降低，随后跌破中间低点（MSS）
const divCandles = candlesFromCloses(closesFromPath([[0, 50], [10, 58], [15, 55], [22, 58.6], [24, 57], [30, 51]], 0.25), warmup.at(-1)!)
const divMacd = macd(divCandles, warmup)

export const macdDiagrams: Diagram[] = [
  {
    file: 'macd-basics',
    title: 'MACD 读法：金叉、柱体缩短（动能衰减）、死叉、下穿 0 轴',
    candles: basicCandles,
    step: 20,
    panel: macdPanel(basicMacd, {
      marks: [
        { at: 5, text: '金叉', pos: 'below' },
        { at: 18, text: '柱体缩短', pos: 'above' },
        { at: 23, text: '死叉', pos: 'above' },
        { at: 30, text: '下穿 0 轴', pos: 'below' },
      ],
    }),
  },
  {
    file: 'macd-divergence',
    title: '看跌背离：价格扫 BSL 创新高，MACD 高点降低，随后 MSS',
    candles: divCandles,
    lines: [
      { from: 11, to: 23, y: divCandles[11][1] }, // BSL：由「扫 BSL」标注说明，线上空间不够放标签
      { from: 15, to: 26, y: divCandles[15][2], label: 'MSS', labelFrom: 22 },
    ],
    segments: [{ from: [11, divCandles[11][1]], to: [23, divCandles[23][1]], label: '价格：更高的高点' }],
    marks: [{ at: 23, text: '扫 BSL', pos: 'above' }],
    panel: macdPanel(divMacd, {
      segments: [{ from: [12, divMacd.macd[12]], to: [22, divMacd.macd[22]], label: 'MACD：更低的高点' }],
    }),
  },
]
