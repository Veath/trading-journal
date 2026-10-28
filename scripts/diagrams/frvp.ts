// FRVP 示意图数据。价格和成交量为示意单位；成交量分布、POC、Value Area 由 calc.ts 从 K 线 + 成交量算出。
import { profileLevels, volumeProfile } from './calc.ts'
import type { Diagram, OHLC } from './render.ts'

// 双分布：下方积累（放量）→ 位移快速通过 → 上方新的接受区
const ddCandles: OHLC[] = [
  [50, 52, 49.5, 51.5],
  [51.5, 52.5, 50, 50.5],
  [50.5, 51.5, 49.2, 51],
  [51, 52.8, 50.5, 52.2],
  [52.2, 52.6, 50.3, 50.8],
  [50.8, 52, 49.8, 51.6],
  [51.6, 52.5, 50.6, 52],
  [52, 56.5, 51.8, 56], // 7 位移
  [56, 60.5, 55.8, 60], // 8
  [60, 61.8, 59.2, 60.5],
  [60.5, 62.5, 59.8, 62],
  [62, 62.8, 60.2, 60.8],
  [60.8, 62.2, 59.5, 61.5],
  [61.5, 63, 60.8, 62.5],
  [62.5, 63.2, 60.5, 61],
  [61, 62.5, 60.3, 62],
]
const ddVolumes = [14, 13, 13, 12, 12, 12, 12, 4, 4, 4, 5, 4, 4, 4, 3, 3]
const ddProfile = volumeProfile(ddCandles, ddVolumes, 0, 15, 1)
const dd = profileLevels(ddProfile)

// 位移腿里的 FVG 正好是 LVN：回撤进入后被拒绝
const lvnCandles: OHLC[] = [
  [46, 48, 45.5, 47.5],
  [47.5, 48.5, 46, 46.5],
  [46.5, 48, 45.8, 47.8],
  [47.8, 49, 47, 48.2],
  [48.2, 48.8, 46.5, 47],
  [47, 48.6, 46.6, 48.3],
  [48.3, 49.2, 47.8, 48.8], // 6 K1 高点 49.2
  [48.8, 55.5, 48.6, 55], // 7 位移
  [55, 58.5, 53.5, 58], // 8 K3 低点 53.5 → FVG 49.2–53.5
  [58, 60, 57, 59.5],
  [59.5, 60.8, 58.2, 58.8],
  [58.8, 60.5, 58, 60.2],
  [60.2, 61, 58.6, 59],
  [59, 59.5, 55.5, 56],
  [56, 56.5, 52.5, 53], // 14 回撤进入 FVG / LVN
  [53, 57.5, 52.6, 57.2],
  [57.2, 61, 57, 60.6],
  [60.6, 63.5, 60.2, 63],
]
const lvnVolumes = [10, 9, 9, 9, 9, 9, 9, 5, 5, 4, 4, 4, 3, 5, 5, 6, 6, 6]
const lvnProfile = volumeProfile(lvnCandles, lvnVolumes, 0, 12, 1)
const lvn = profileLevels(lvnProfile)

export const frvpDiagrams: Diagram[] = [
  {
    file: 'frvp-anatomy',
    title: 'FRVP：POC、Value Area（70%）、HVN 与 LVN',
    candles: ddCandles,
    profile: ddProfile,
    zones: [
      { from: 0, top: 59, bottom: 53, kind: 'neutral', label: 'LVN：快速通过' },
      { from: 9, to: 15, top: 63, bottom: 60, kind: 'neutral', label: 'HVN' },
    ],
    lines: [
      { from: 0, y: dd.vah, label: 'VAH' },
      { from: 0, y: dd.poc, label: 'POC', kind: 'entry' },
      { from: 0, y: dd.val, label: 'VAL' },
    ],
    spans: [
      { from: 0, to: 6, label: '接受（放量）' },
      { from: 7, to: 8, label: '位移' },
      { from: 9, to: 15, label: '新的接受区' },
    ],
  },
  {
    file: 'frvp-lvn-fvg',
    title: 'FVG 与 LVN 重叠：回撤进入低成交区后被拒绝',
    candles: lvnCandles,
    profile: lvnProfile,
    zones: [
      { from: 0, to: 12, top: 57, bottom: 49, kind: 'neutral', label: 'LVN' },
      { from: 6, top: 53.5, bottom: 49.2, kind: 'bull', label: 'FVG' },
    ],
    lines: [{ from: 0, y: lvn.poc, label: 'POC', kind: 'entry' }],
    spans: [{ from: 0, to: 12, label: 'FRVP 区间' }],
    marks: [
      { at: 7, text: '位移', pos: 'above' },
      { at: 14, text: '回撤入场', pos: 'below' },
    ],
  },
]
