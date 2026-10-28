// 指标计算：示意图里的 RSI / VWAP / Volume Profile 都由 K 线 + 成交量算出，避免与 K 线不一致。
import type { OHLC, Profile } from './render.ts'

/** Wilder RSI。warmup 是图上不显示的前置收盘价，让第一根可见 K 线就有值 */
export function rsi(candles: OHLC[], period = 14, warmup: number[] = []): number[] {
  const closes = [...warmup, ...candles.map((c) => c[3])]
  const out: number[] = []
  let avgUp = 0
  let avgDown = 0
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const up = Math.max(d, 0)
    const down = Math.max(-d, 0)
    if (i <= period) {
      avgUp += up / period
      avgDown += down / period
    } else {
      avgUp = (avgUp * (period - 1) + up) / period
      avgDown = (avgDown * (period - 1) + down) / period
    }
    out[i] = i < period ? NaN : avgDown === 0 ? 100 : 100 - 100 / (1 + avgUp / avgDown)
  }
  out[0] = NaN
  return out.slice(warmup.length).map((v) => Math.round(v * 10) / 10)
}

/** Session VWAP 与成交量加权标准差，从第一根 K 线开始累加，典型价 = hlc3 */
export function vwap(candles: OHLC[], volumes: number[]): { vwap: number[]; sd: number[] } {
  let pv = 0
  let pv2 = 0
  let vol = 0
  const out = { vwap: [] as number[], sd: [] as number[] }
  candles.forEach(([, h, l, c], i) => {
    const tp = (h + l + c) / 3
    pv += tp * volumes[i]
    pv2 += tp * tp * volumes[i]
    vol += volumes[i]
    const mean = pv / vol
    out.vwap.push(mean)
    out.sd.push(Math.sqrt(Math.max(pv2 / vol - mean * mean, 0)))
  })
  return out
}

/** VWAP ± k·σ 带 */
export function vwapBand(v: { vwap: number[]; sd: number[] }, k: number): number[] {
  return v.vwap.map((m, i) => m + k * v.sd[i])
}

/**
 * 固定区间成交量分布：每根 K 线的成交量按 [low, high] 均匀分摊到各价格行。
 * Value Area 从 POC 开始，每次把相邻两行中成交量较大的一行并入，直到覆盖 vaPct。
 */
export function volumeProfile(candles: OHLC[], volumes: number[], from: number, to: number, rowSize: number, vaPct = 0.7): Profile {
  const slice = candles.slice(from, to + 1)
  const lo = Math.floor(Math.min(...slice.map((c) => c[2])) / rowSize) * rowSize
  const hi = Math.ceil(Math.max(...slice.map((c) => c[1])) / rowSize) * rowSize
  const rows: Profile['rows'] = []
  for (let p = lo; p < hi - 1e-9; p += rowSize) rows.push({ lo: p, hi: p + rowSize, volume: 0 })
  slice.forEach(([, h, l], k) => {
    const v = volumes[from + k]
    for (const r of rows) {
      const overlap = Math.min(h, r.hi) - Math.max(l, r.lo)
      if (overlap > 0) r.volume += h === l ? v : (v * overlap) / (h - l)
    }
  })
  const total = rows.reduce((s, r) => s + r.volume, 0)
  const poc = rows.reduce((best, r, i) => (r.volume > rows[best].volume ? i : best), 0)
  let a = poc
  let b = poc
  let sum = rows[poc].volume
  while (sum < total * vaPct && (a > 0 || b < rows.length - 1)) {
    const below = a > 0 ? rows[a - 1].volume : -1
    const above = b < rows.length - 1 ? rows[b + 1].volume : -1
    if (above >= below) sum += rows[++b].volume
    else sum += rows[--a].volume
  }
  return { from, to, rows, poc, va: [a, b] }
}

/** Profile 的关键价位 */
export function profileLevels(p: Profile): { poc: number; vah: number; val: number } {
  const r = p.rows
  return { poc: (r[p.poc].lo + r[p.poc].hi) / 2, vah: r[p.va[1]].hi, val: r[p.va[0]].lo }
}

/** EMA，α = 2 / (n + 1)，以前 n 个值的 SMA 作为初值；warmup 为图上不显示的前置收盘价 */
export function ema(values: number[], period: number, warmup: number[] = []): number[] {
  const all = [...warmup, ...values]
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = NaN
  all.forEach((v, i) => {
    if (i < period - 1) return void out.push(NaN)
    prev = i === period - 1 ? all.slice(0, period).reduce((s, x) => s + x, 0) / period : v * k + prev * (1 - k)
    out.push(prev)
  })
  return out.slice(warmup.length)
}

/** MACD = EMA(fast) − EMA(slow)，Signal = MACD 的 EMA(signal)，Histogram = MACD − Signal */
export function macd(candles: OHLC[], warmup: number[] = [], fast = 12, slow = 26, signal = 9) {
  const closes = [...warmup, ...candles.map((c) => c[3])]
  const fastE = ema(closes, fast)
  const slowE = ema(closes, slow)
  const line = closes.map((_, i) => fastE[i] - slowE[i])
  const valid = line.findIndex((v) => !Number.isNaN(v))
  const sig = [...Array(valid).fill(NaN), ...ema(line.slice(valid), signal)]
  const n = warmup.length
  return {
    macd: line.slice(n),
    signal: sig.slice(n),
    histogram: line.map((v, i) => v - sig[i]).slice(n),
  }
}

/**
 * 由收盘价路径生成示意 K 线：开盘 = 上一根收盘，影线按 wick 比例伸出实体。
 * points 为 [下标, 收盘价] 折线拐点，中间线性插值，再叠加确定性的小幅摆动。
 */
export function closesFromPath(points: [number, number][], wiggle = 0): number[] {
  const out: number[] = []
  for (let k = 0; k < points.length - 1; k++) {
    const [i0, v0] = points[k]
    const [i1, v1] = points[k + 1]
    for (let i = i0; i < i1; i++) out.push(v0 + ((v1 - v0) * (i - i0)) / (i1 - i0) + wiggle * Math.sin(i * 2.1))
  }
  out.push(points.at(-1)![1])
  return out.map((v) => Math.round(v * 100) / 100)
}

export function candlesFromCloses(closes: number[], open: number, wick = 0.4): OHLC[] {
  return closes.map((c, i) => {
    const o = i === 0 ? open : closes[i - 1]
    const body = Math.max(Math.abs(c - o), 0.3)
    const r = (v: number) => Math.round(v * 100) / 100
    return [o, r(Math.max(o, c) + body * wick), r(Math.min(o, c) - body * wick), c]
  })
}
