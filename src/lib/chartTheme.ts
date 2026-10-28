// lightweight-charts 图表的配色：取自 styles.css 的颜色变量，跟随站点浅色 / 深色模式。
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
    surface: v('--surface'),
    border: v('--border'),
    grid: v('--grid'),
    text: v('--text'),
    text2: v('--text-2'),
    muted: v('--muted'),
    accent: v('--accent'),
    up: v('--pos-mark'),
    down: v('--neg-mark'),
    ema2: dark ? '#a98bf0' : '#7a52c7',
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

/** 公共的图表外观：背景、网格、坐标轴 */
export function baseChartOptions(c: ChartColors) {
  return {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: c.surface }, textColor: c.muted, fontFamily: c.font, fontSize: 11, panes: { separatorColor: c.border, separatorHoverColor: alpha(c.accent, 0.2) } },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
  }
}
