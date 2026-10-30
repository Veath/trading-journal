// lightweight-charts 图表的配色：取自 styles.css 的 --chart-* 变量，跟随站点浅色 / 深色模式。
// 浅色为米色纸面 + 黑白 K 线（与 TradingView 布局一致）；bull / bear 是看涨 / 看跌标注色，不是盈亏色。
// 示意图专用的 EMA 颜色与 scripts/diagrams/render.ts 保持一致。
import { useEffect, useState } from 'react'
import { ColorType } from 'lightweight-charts'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const mq = matchMedia(DARK_QUERY)
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

export function themeColors() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  const dark = matchMedia(DARK_QUERY).matches
  return {
    bg: v('--chart-bg'),
    border: v('--chart-border'),
    grid: v('--chart-grid'),
    text: v('--chart-text'),
    text2: v('--chart-text-2'),
    muted: v('--chart-muted'),
    accent: v('--chart-accent'),
    bull: v('--chart-bull'),
    bear: v('--chart-bear'),
    candleUp: v('--chart-candle-up'),
    candleUpLine: v('--chart-candle-up-line'),
    candleDown: v('--chart-candle-down'),
    volUp: v('--chart-vol-up'),
    volDown: v('--chart-vol-down'),
    ema2: dark ? '#a98bf0' : '#b5651d',
    ema3: dark ? '#3cc4ae' : '#16917f',
    font: getComputedStyle(document.body).fontFamily,
  }
}
export type ChartColors = ReturnType<typeof themeColors>

/** #rrggbb → rgba()；其他格式原样返回 */
export function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** K 线系列的颜色：阳线空心（实体同背景）、阴线实心 */
export function candleColors(c: ChartColors) {
  return {
    upColor: c.candleUp,
    downColor: c.candleDown,
    borderUpColor: c.candleUpLine,
    borderDownColor: c.candleDown,
    wickUpColor: c.candleUpLine,
    wickDownColor: c.candleDown,
  }
}

/** 公共的图表外观：背景、网格、坐标轴 */
export function baseChartOptions(c: ChartColors) {
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.muted, fontFamily: c.font, fontSize: 11, panes: { separatorColor: c.border, separatorHoverColor: alpha(c.accent, 0.2) } },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
  }
}
