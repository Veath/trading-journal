// 自然交易理论示意图数据。K 线由收盘价路径生成，价格和成交量为示意单位，不对应真实行情；
// Fib 回撤价位、Fib 趋势时间竖线、量能曲线由 calc.ts 算出。
import { candlesFromCloses, closesFromPath, energyCurves, fibLevels, fibTime } from './calc.ts'
import type { Diagram, Line, OHLC, Panel, Segment } from './render.ts'

const RETRACE = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const
// 书中 Fib 趋势时间的节奏：长短长（0–0.382 长、0.382–0.618 短、0.618–1 长），之后重复
const TIME = [0, 0.382, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3] as const

/** Fib 回撤水平线：0 / 0.382 / 0.5 / 0.618 / 1 带右侧标签，0.618 用琥珀色强调 */
function fibLines(p0: number, p1: number, from = 0): Line[] {
  const prices = fibLevels(p0, p1, RETRACE)
  return RETRACE.map((r, i) => ({
    from,
    y: prices[i],
    label: [0, 0.382, 0.5, 0.618, 1].includes(r) ? String(r) : undefined,
    kind: r === 0.618 ? 'entry' : 'neutral',
  }))
}

/** 成交量：上涨 K 线取 bull(i)，下跌 K 线取 bear(i)，再叠加确定性的高低起伏 */
function volumesOf(candles: OHLC[], bull: (i: number) => number, bear: (i: number) => number): number[] {
  return candles.map(([o, , , c], i) => Math.round((c >= o ? bull(i) : bear(i)) * (1 + 0.3 * Math.sin(i * 2.3) * Math.cos(i * 0.7))))
}

/** values 在 [from, to] 内最大值的位置，用于把趋势线画在量能曲线的波峰上（跳过 EMA 开头的 NaN） */
function peak(values: number[], from: number, to: number): [number, number] {
  let at = -1
  for (let i = from; i <= to; i++) if (!Number.isNaN(values[i]) && (at < 0 || values[i] > values[at])) at = i
  return [at, Math.round(values[at] * 100) / 100]
}

/** 成交量副图 + 多空量能曲线 */
function energyPanel(candles: OHLC[], volumes: number[], title: string, extra: Partial<Panel> = {}): Panel {
  const e = energyCurves(candles, volumes, 5)
  return {
    title,
    volume: volumes,
    curves: [
      { values: e.bull, kind: 'bull' },
      { values: e.bear, kind: 'bear' },
    ],
    min: 0,
    max: Math.max(...volumes) * 1.25,
    ...extra,
  }
}

/** 下标区间内的「发力」强度，区间外为 0 */
const push = (ranges: [from: number, to: number, strength: number][]) => (i: number) =>
  ranges.find(([a, b]) => i >= a && i <= b)?.[2] ?? 0

// —— 三要素合一：回撤到 0.382 强引力（空间）+ 0.618 时间窗口（时间）+ 空头量能衰退、多头量能回升（能量）——
const threeCloses = closesFromPath([[0, 50], [10, 62], [14, 58.5], [20, 54.7], [22, 55.2], [30, 63]], 0.3)
const threeCandles = candlesFromCloses(threeCloses, 49.5)
const threeVolumes = volumesOf(
  threeCandles,
  (i) => 6 + push([[0, 10, 6], [22, 30, 7]])(i),
  (i) => 4 + push([[11, 16, 6], [17, 21, 2]])(i),
)
const threeFib = fibLevels(50, 62, [0.382])[0]
const threeTime = fibTime(0, 10, 14, [0, 0.618, 1])

// —— 手绘量能曲线：多头量能逐波衰减 → 空头量能接管 ——
const energyCloses = closesFromPath([[0, 50], [8, 58], [11, 56], [18, 61], [21, 59.5], [27, 62], [32, 57], [36, 58], [44, 50]], 0.35)
const energyCandles = candlesFromCloses(energyCloses, 49.5)
const energyVolumes = volumesOf(
  energyCandles,
  (i) => 4 + push([[0, 8, 12], [12, 18, 7], [22, 27, 3]])(i),
  (i) => 4 + push([[28, 32, 7], [37, 44, 11]])(i),
)
const energyBull = energyCurves(energyCandles, energyVolumes, 5).bull

// —— Fib 回撤的「盒子」：上涨段 0 在下、1 在上，0.618 贴住 K 柱密集区，0.618–1 是缓冲垫 ——
const boxCloses = closesFromPath([[0, 50], [10, 63.5], [13, 61.5], [15, 64], [18, 62.2], [20, 66.5], [22, 63.8], [26, 64.6], [28, 62.6], [32, 64.4]], 0.3)
const boxCandles = candlesFromCloses(boxCloses, 49.5)
const boxTop = fibLevels(50, 72, [0.618])[0]

// —— Fib 趋势时间：锚点 1（低点）→ 锚点 2（高点）为单位，从锚点 3 起投射 ——
const timeCloses = closesFromPath([[0, 50], [10, 60], [14, 55], [20, 61], [24, 56], [28, 58], [30, 64], [34, 59], [40, 66], [45, 62]], 0.4)
const timeCandles = candlesFromCloses(timeCloses, 50.5)
const timeAt = fibTime(0, 10, 14, TIME)

// —— 引力：下跌段 0 在上、1 在下；0.618 / 0.382 反复吸引并停留，0.5 只是经过 ——
const gravityCloses = closesFromPath(
  [[0, 70], [5, 58], [9, 57.4], [11, 55.2], [13, 57.8], [16, 60.1], [17, 61.4], [19, 62.6], [23, 62.1], [25, 59.8], [26, 58.5], [30, 57.5], [33, 61], [36, 62.4], [38, 62]],
  0.3,
)
const gravityCandles = candlesFromCloses(gravityCloses, 70.5)
const gravityFib = fibLevels(70, 50, [0.382, 0.5, 0.618])

// —— 量能精进：单根 K 柱的多空强弱（null 为间隔） ——
const strengthCandles: (OHLC | null)[] = [
  [50, 58.5, 49.6, 58.2], // 0 多头绝对强势：长阳实体
  null,
  null,
  [53, 56, 46, 55.5], // 3 多头绝对强势：阳线 + 长下影
  null,
  null,
  [55, 55.6, 47, 53.6], // 6 多头相对强势：阴线，但下影远长于实体
  null,
  null,
  [58.2, 58.6, 50, 50.3], // 9 空头绝对强势：长阴实体
  null,
  null,
  [53, 61, 51, 51.6], // 12 空头绝对强势：阴线 + 长上影
  null,
  null,
  [51.2, 60, 50.6, 52.8], // 15 空头相对强势：阳线，但上影远长于实体
  null,
  null,
  [54, 58, 50, 54.2], // 18 十字线
]

// —— 主次量能：多头主量能 M 开启并延续上涨，H / L 夯实基础 ——
const majorCloses = closesFromPath([[0, 50], [6, 49], [8, 55], [14, 54], [18, 56], [22, 55.5], [24, 60], [30, 59], [36, 63], [40, 62]], 0.35)
const majorCandles = candlesFromCloses(majorCloses, 50.5)
const majorVolumes = volumesOf(
  majorCandles,
  (i) => (i === 7 ? 30 : i === 23 ? 26 : i === 12 || i === 33 ? 15 : i === 16 || i === 28 ? 9 : 5),
  (i) => (i === 5 ? 10 : 5),
)

// —— Fib 下降通道 + 空头量能消亡 ——
// 通道 0 线连接三个高点（3 / 15 / 27），1 线连接两个低点（9 / 21），每根 K 线下移 0.4
const chanAt = (i: number, r: number) => Math.round((70 - 0.4 * i - 12 * r) * 100) / 100
const chanCloses = closesFromPath(
  [[0, 66], [3, chanAt(3, 0.05)], [9, chanAt(9, 0.95)], [15, chanAt(15, 0.05)], [21, chanAt(21, 0.95)], [27, chanAt(27, 0.08)], [33, chanAt(33, 0.85)], [38, chanAt(38, 0.55)], [41, chanAt(41, 0.75)], [44, chanAt(44, 0.15)], [47, 52.8]],
  0.25,
)
const chanCandles = candlesFromCloses(chanCloses, 65.5)
const chanVolumes = volumesOf(
  chanCandles,
  (i) => 4 + push([[42, 47, 3]])(i),
  (i) => 4 + push([[4, 9, 14], [16, 21, 9], [28, 33, 5], [39, 41, 2]])(i),
)
const N_CHAN = chanCandles.length - 1
const channel: Segment[] = [0, 0.382, 0.618, 1].map((r) => ({
  from: [0, chanAt(0, r)],
  to: [N_CHAN, chanAt(N_CHAN, r)],
  label: String(r),
  kind: r === 0 || r === 1 ? 'bear' : 'neutral',
}))

export const nttDiagrams: Diagram[] = [
  {
    file: 'ntt-three-elements',
    title: '三要素合一：空间（0.382 强引力）+ 时间（0.618 时间窗口）+ 能量（空头衰退）',
    candles: threeCandles,
    lines: fibLines(50, 62),
    vlines: threeTime.map((at, i) => ({ at, label: `时间 ${['0', '0.618', '1'][i]}`, kind: i === 1 ? 'accent' : 'neutral' })),
    zones: [{ from: 19, to: 22, top: threeFib + 1, bottom: threeFib - 1.2, kind: 'accent' }],
    marks: [{ at: 21, text: '空间 + 时间 + 能量', pos: 'below' }],
    panel: energyPanel(threeCandles, threeVolumes, '成交量（蓝 = 多头量能，红 = 空头量能）'),
    step: 20,
  },
  {
    file: 'ntt-energy-curve',
    title: '量能曲线：多头量能一波比一波弱，空头量能接管',
    candles: energyCandles,
    spans: [
      { from: 0, to: 8, label: '多头强' },
      { from: 12, to: 27, label: '多头逐波衰减' },
      { from: 28, to: 44, label: '空头接管' },
    ],
    panel: energyPanel(energyCandles, energyVolumes, '成交量 + 多空量能曲线', {
      segments: [{ from: peak(energyBull, 0, 10), to: peak(energyBull, 20, 28), kind: 'bull', label: '多头量能趋势线（手绘）' }],
    }),
    step: 16,
  },
  {
    file: 'ntt-fib-box',
    title: 'Fib 回撤的「盒子」：0.618 贴住 K 柱密集区，0.618–1 是缓冲垫',
    candles: boxCandles,
    lines: fibLines(50, 72),
    zones: [{ from: 0, top: 72, bottom: boxTop, kind: 'neutral', label: '缓冲垫' }],
    marks: [{ at: 20, text: '刺入缓冲垫', pos: 'above' }],
    step: 18,
  },
  {
    file: 'ntt-fib-time',
    title: 'Fib 趋势时间：锚点 1→2 为单位，从锚点 3 起按「长短长」投射',
    candles: [...timeCandles, null],
    vlines: timeAt.map((at, i) => ({ at, label: String(TIME[i]), kind: Math.abs((TIME[i] % 1) - 0.618) < 1e-9 ? 'accent' : 'neutral' })),
    marks: [
      { at: 0, text: '①', pos: 'below' },
      { at: 10, text: '②', pos: 'above' },
      { at: 14, text: '③', pos: 'below' },
      { at: 20, text: '波动', pos: 'above' },
      { at: 30, text: '波动', pos: 'above' },
      { at: 40, text: '波动', pos: 'above' },
    ],
    step: 16,
  },
  {
    file: 'ntt-gravity',
    title: '引力：0.618 / 0.382 强引力（停留），0.5 次引力（经过）',
    candles: gravityCandles,
    lines: fibLines(70, 50),
    zones: [
      { from: 5, to: 13, top: gravityFib[2] + 0.8, bottom: gravityFib[2] - 0.8, kind: 'accent' },
      { from: 17, to: 24, top: gravityFib[0] + 0.8, bottom: gravityFib[0] - 0.8, kind: 'accent' },
      { from: 26, to: 31, top: gravityFib[2] + 0.8, bottom: gravityFib[2] - 0.8, kind: 'accent' },
      { from: 34, to: 38, top: gravityFib[0] + 0.8, bottom: gravityFib[0] - 0.8, kind: 'accent' },
    ],
    marks: [
      { at: 11, text: '过载', pos: 'below' },
      { at: 16, text: '经过 0.5', pos: 'below' },
    ],
    step: 18,
  },
  {
    file: 'ntt-candle-strength',
    title: '量能精进：单根 K 柱的绝对强势与相对强势',
    candles: strengthCandles,
    marks: [
      { at: 0, text: '多头绝对', pos: 'below' },
      { at: 3, text: '多头绝对', pos: 'below' },
      { at: 6, text: '多头相对', pos: 'below' },
      { at: 9, text: '空头绝对', pos: 'above' },
      { at: 12, text: '空头绝对', pos: 'above' },
      { at: 15, text: '空头相对', pos: 'above' },
      { at: 18, text: '十字线', pos: 'above' },
    ],
    step: 30,
  },
  {
    file: 'ntt-major-volume',
    title: '主次量能：多头主量能 M 定方向，H / L 夯实基础',
    candles: majorCandles,
    segments: [{ from: [6, 49.2], to: [39, 61.5], kind: 'bull' }],
    panel: {
      title: '成交量（M = 主量能，H / L = 相对高位 / 低位）',
      volume: majorVolumes,
      min: 0,
      max: 38,
      marks: [
        { at: 7, text: 'M', pos: 'above' },
        { at: 23, text: 'M', pos: 'above' },
        { at: 12, text: 'H', pos: 'above' },
        { at: 33, text: 'H', pos: 'above' },
        { at: 16, text: 'L', pos: 'above' },
        { at: 28, text: 'L', pos: 'above' },
        { at: 5, text: '空头', pos: 'above' },
      ],
    },
    step: 18,
  },
  {
    file: 'ntt-fib-channel',
    title: 'Fib 下降通道：多次高低点确认，空头量能逐波衰减 → 通道失效',
    candles: chanCandles,
    segments: channel,
    marks: [
      { at: 3, text: '高点 1', pos: 'above' },
      { at: 15, text: '高点 2', pos: 'above' },
      { at: 27, text: '高点 3', pos: 'above' },
      { at: 44, text: '失效 ≠ 反转', pos: 'above' },
    ],
    panel: energyPanel(chanCandles, chanVolumes, '空头量能：每次发力都比上一次弱'),
    step: 16,
  },
]
