// ICT 概念示意图数据。价格为示意单位，不对应真实行情。
import type { Diagram, OHLC } from './render.ts'

// 看涨 Breaker / Unicorn 共用的走势：扫低 → 位移突破前高 → 回撤
const breakerCandles: OHLC[] = [
  [58, 59, 54, 55],
  [55, 55.5, 50, 51],
  [51, 52, 49, 51.5], // 2 前低 49（SSL）
  [51.5, 55, 51, 54.5],
  [54.5, 57, 54, 56.5], // 4 下跌前最后一根上涨 K 线 → Breaker
  [56.5, 57, 52, 52.5],
  [52.5, 53, 48, 48.5],
  [48.5, 49, 46, 47.5], // 7 扫掉 49
  [47.5, 56, 47, 55.8], // 8 位移
  [55.8, 60, 55.5, 59.5], // 9 突破 57；低点 55.5 与 K1 高点 49 之间为 FVG
  [59.5, 60.5, 57.5, 58],
  [58, 58.5, 54.5, 56], // 11 回撤入场
  [56, 62, 55.5, 61.5],
  [61.5, 66, 61, 65.5],
]

export const ictDiagrams: Diagram[] = [
  {
    file: 'fvg',
    title: '看涨 FVG：K1 高点与 K3 低点之间的缺口',
    candles: [
      [50, 52, 47, 48],
      [48, 49, 45, 46],
      [46, 47, 44, 45.5],
      [45.5, 47, 45, 46.5], // 3 K1
      [46.5, 58.5, 46, 58], // 4 K2 位移
      [58, 61, 52, 60], // 5 K3
      [60, 61, 56, 57],
      [57, 57.5, 50, 52.5], // 7 回撤进入 FVG
      [52.5, 60, 52, 59],
      [59, 65, 58, 64],
      [64, 68, 63, 67],
    ],
    zones: [{ from: 3, top: 52, bottom: 47, kind: 'bull', label: '看涨 FVG' }],
    lines: [{ from: 3, y: 49.5, label: 'CE（50%）' }],
    marks: [
      { at: 3, text: 'K1', pos: 'below' },
      { at: 4, text: 'K2 位移', pos: 'above' },
      { at: 5, text: 'K3', pos: 'above' },
      { at: 7, text: '回撤入场', pos: 'below' },
    ],
  },
  {
    file: 'order-block',
    title: '看涨 Order Block：位移前最后一根下跌 K 线',
    candles: [
      [56, 58, 55, 57.5],
      [57.5, 59.5, 57, 58], // 1 前高 59.5
      [58, 58.5, 54, 54.5],
      [54.5, 55, 51, 52],
      [52, 52.5, 48, 49], // 4 OB
      [49, 57, 48.5, 56.5], // 5 位移
      [56.5, 63, 56, 62.5], // 6 突破前高
      [62.5, 64, 58, 59],
      [59, 59.5, 51.5, 53], // 8 回到 OB
      [53, 60, 52.5, 59.5],
      [59.5, 66, 59, 65],
    ],
    zones: [{ from: 4, top: 52.5, bottom: 48, kind: 'bull', label: '看涨 OB' }],
    lines: [
      { from: 4, y: 50.5, label: 'Mean Threshold（实体 50%）' },
      { from: 1, to: 6, y: 59.5, label: '前高' },
    ],
    marks: [
      { at: 5, text: '位移', pos: 'above' },
      { at: 6, text: '突破结构', pos: 'above' },
      { at: 8, text: '回到 OB 入场', pos: 'below' },
    ],
  },
  {
    file: 'liquidity-raid',
    title: '流动性：等高点上方的 BSL 被扫后反转（Turtle Soup）',
    candles: [
      [50, 53, 49, 52.5], // 0 低点 49
      [52.5, 57, 52, 56.5],
      [56.5, 60, 55.5, 57], // 2 高点 60
      [57, 57.5, 53, 54],
      [54, 58, 53.5, 57.5],
      [57.5, 60, 56.5, 57], // 5 等高 60
      [57, 57.5, 54, 55],
      [55, 59, 54.5, 58.5],
      [58.5, 62.5, 57.5, 58], // 8 刺穿后收回
      [58, 58.5, 52, 52.5], // 9 反向位移
      [52.5, 53, 48, 49],
      [49, 50, 45, 45.5],
    ],
    lines: [
      { from: 2, to: 8, y: 60, label: 'EQH：上方是 BSL（空头止损 + 突破买单）' },
      { from: 0, y: 49, label: 'SSL → 下一个 DOL', kind: 'target' },
    ],
    marks: [
      { at: 8, text: '扫流动性（Raid）', pos: 'above' },
      { at: 9, text: '反向位移', pos: 'below' },
    ],
  },
  {
    file: 'market-structure',
    title: '市场结构：下跌中的 BOS，扫 SSL 后位移形成 MSS',
    candles: [
      [70, 71, 66, 67],
      [67, 68, 63, 64],
      [64, 67, 63.5, 66.5],
      [66.5, 67.5, 65, 65.5], // 3 摆动高点
      [65.5, 66, 60, 61],
      [61, 61.5, 57, 58], // 5 摆动低点 57
      [58, 62, 57.5, 61.5],
      [61.5, 63, 60, 60.5], // 7 更低的高点
      [60.5, 61, 55, 56], // 8 跌破 57 → BOS
      [56, 56.5, 52, 53], // 9 低点 52
      [53, 56, 52.5, 55.5],
      [55.5, 57, 54.5, 55], // 11 短期高点 57
      [55, 55.5, 51, 52],
      [52, 52.5, 49, 51.5], // 13 扫 52
      [51.5, 58.5, 51, 58], // 14 位移突破 57 → MSS
      [58, 61, 57.5, 60.5],
      [60.5, 61, 58.5, 59],
    ],
    lines: [
      { from: 5, to: 8, y: 57, label: 'BOS' },
      { from: 9, to: 13, y: 52, label: 'SSL' },
      { from: 11, to: 14, y: 57, label: 'MSS' },
    ],
    marks: [
      { at: 3, text: '高点', pos: 'above' },
      { at: 7, text: '更低高点', pos: 'above' },
      { at: 13, text: '扫流动性', pos: 'below' },
      { at: 14, text: '位移', pos: 'above' },
    ],
  },
  {
    file: 'cisd',
    title: '看跌 CISD：收盘跌破向上推动第一根阳线的开盘价',
    candles: [
      [57, 58, 55.5, 56],
      [56, 60, 55.8, 59.5], // 1 等高点 60
      [59.5, 59.8, 57, 57.5],
      [57.5, 58, 56, 56.5],
      [56.5, 60, 56.2, 59], // 4 等高点 60
      [59, 59.3, 57.5, 58],
      [58, 58.4, 55.8, 57.3], // 6 最近的更高低点 55.8
      [57.3, 58.8, 57.1, 58.6], // 7 向上推动第一根阳线，开盘 57.3
      [58.6, 59.8, 58.4, 59.6],
      [59.6, 61.8, 59.4, 59.8], // 9 扫 EQH
      [59.8, 60.3, 58.6, 58.9],
      [58.9, 59.2, 56.6, 56.9], // 11 收盘跌破 57.3 → CISD
      [56.9, 57.5, 55, 55.4], // 12 跌破 55.8 → CHOCH
      [55.4, 55.8, 53, 53.4],
    ],
    lines: [
      { from: 1, to: 9, y: 60, label: 'EQH' },
      { from: 7, to: 11, y: 57.3, label: '阳线串开盘价', labelFrom: 8 },
      { from: 6, to: 12, y: 55.8, label: '最近的更高低点', labelFrom: 8 },
    ],
    marks: [
      { at: 9, text: '扫 EQH', pos: 'above' },
      { at: 11, text: 'CISD', pos: 'above' },
      { at: 12, text: 'CHOCH', pos: 'below' },
    ],
  },
  {
    file: 'premium-discount-ote',
    title: 'Premium / Discount 与 OTE（62%–79% 回撤）',
    candles: [
      [48, 49, 43, 44],
      [44, 45, 41, 42],
      [42, 43, 40, 42.5], // 2 摆动低点 40
      [42.5, 49, 42, 48.5],
      [48.5, 55, 48, 54.5],
      [54.5, 56, 52, 53],
      [53, 62, 52.5, 61.5],
      [61.5, 68, 61, 67],
      [67, 70, 65, 66], // 8 摆动高点 70
      [66, 66.5, 60, 61],
      [61, 61.5, 55, 56],
      [56, 56.5, 50, 51],
      [51, 51.5, 47.5, 49.5], // 12 进入 OTE
      [49.5, 56, 49, 55.5],
      [55.5, 63, 55, 62.5],
      [62.5, 72, 62, 71],
    ],
    zones: [
      { from: 2, top: 70, bottom: 55, kind: 'bear', label: 'Premium（溢价）：找卖点' },
      { from: 2, top: 55, bottom: 40, kind: 'neutral', label: 'Discount（折价）：找买点' },
      { from: 8, top: 51.4, bottom: 46.3, kind: 'accent', label: 'OTE 62%–79%（虚线 70.5%）' },
    ],
    lines: [
      { from: 2, y: 55, label: 'Equilibrium 50%' },
      { from: 8, y: 48.85 },
    ],
    marks: [{ at: 12, text: 'OTE 入场', pos: 'below' }],
  },
  {
    file: 'breaker',
    title: '看涨 Breaker：扫低之后，被向上突破的那段上涨 K 线',
    candles: breakerCandles,
    zones: [{ from: 4, top: 57, bottom: 54, kind: 'bull', label: '看涨 Breaker' }],
    lines: [
      { from: 2, to: 7, y: 49, label: 'SSL' },
      { from: 4, to: 9, y: 57, label: '前高' },
    ],
    marks: [
      { at: 7, text: '扫低', pos: 'below' },
      { at: 9, text: '突破前高', pos: 'above' },
      { at: 11, text: '回撤入场', pos: 'below' },
    ],
  },
  {
    file: 'unicorn',
    title: 'Unicorn：Breaker 与 FVG 重叠的区域',
    candles: breakerCandles,
    zones: [
      { from: 4, top: 57, bottom: 54, kind: 'bull', label: 'Breaker' },
      { from: 7, top: 55.5, bottom: 49, kind: 'neutral', label: 'FVG' },
      { from: 9, top: 55.5, bottom: 54, kind: 'accent' },
    ],
    lines: [{ from: 9, y: 54.75, label: '重叠区 = Unicorn', kind: 'entry' }],
    marks: [
      { at: 7, text: 'K1', pos: 'below' },
      { at: 9, text: 'K3', pos: 'above' },
      { at: 11, text: '入场', pos: 'below' },
    ],
  },
  {
    file: 'power-of-3',
    title: 'Power of 3（AMD）：看涨日的日内走势',
    candles: [
      [50, 51, 49.5, 50.5],
      [50.5, 51.5, 50, 51],
      [51, 51.5, 49.8, 50.2],
      [50.2, 51, 49.5, 50.8],
      [50.8, 51.2, 50, 50.3],
      [50.3, 50.5, 47, 47.5], // 5 操纵开始
      [47.5, 48, 44.5, 45],
      [45, 46.5, 44, 46], // 7 当日低点
      [46, 50, 45.5, 49.5],
      [49.5, 53, 49, 52.5],
      [52.5, 56, 52, 55.5],
      [55.5, 57, 54, 54.5],
      [54.5, 60, 54, 59.5],
      [59.5, 63, 59, 62],
      [62, 65, 61, 64],
      [64, 64.5, 62, 63],
    ],
    spans: [
      { from: 0, to: 4, label: '积累 A（Asia）' },
      { from: 5, to: 7, label: '操纵 M（Judas）' },
      { from: 8, to: 15, label: '派发 D（NY）' },
    ],
    lines: [{ from: 0, to: 15, y: 50, label: 'Midnight Open', labelFrom: 10 }],
    marks: [{ at: 7, text: '当日低点', pos: 'below' }],
    big: { ohlc: [50, 65, 44, 63], label: '当日日线' },
  },
  {
    file: '2022-model',
    title: '2022 Model / Silver Bullet：扫 SSL → MSS → FVG 入场 → 目标 BSL',
    candles: [
      [64, 66, 59, 59.5], // 0 前高 66（BSL）
      [59.5, 60, 56, 56.5],
      [56.5, 57, 54, 54.5], // 2 前低 54（SSL）
      [54.5, 58, 54, 57.5],
      [57.5, 58.5, 56.5, 57], // 4 短期高点 58.5
      [57, 57.5, 53, 53.5],
      [53.5, 54, 51.5, 52], // 6 扫 54
      [52, 53, 51, 52.5], // 7 K1
      [52.5, 60, 52, 59.5], // 8 位移 → MSS
      [59.5, 61, 56, 60.5], // 9 K3 → FVG 53–56
      [60.5, 61, 57, 57.5],
      [57.5, 58, 55, 55.5], // 11 回撤入场
      [55.5, 62, 55, 61.5],
      [61.5, 66.5, 61, 65.5], // 13 到达目标
      [65.5, 67, 64, 66.5],
    ],
    zones: [{ from: 7, top: 56, bottom: 53, kind: 'bull', label: '③ FVG' }],
    lines: [
      { from: 0, y: 66, label: '⑤ 目标：BSL（前高）', kind: 'target' },
      { from: 2, to: 6, y: 54, label: 'SSL' },
      { from: 4, to: 8, y: 58.5, label: '② MSS' },
      { from: 11, y: 55.5, label: '④ 入场', kind: 'entry' },
      { from: 11, y: 50.5, label: '止损', kind: 'stop' },
    ],
    marks: [
      { at: 6, text: '① 扫 SSL', pos: 'below' },
      { at: 8, text: '位移', pos: 'above' },
    ],
  },
]
