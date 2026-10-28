import type { DayEntry, Trade } from '../types'
import { parseDay, parseTrade, sortByDate } from './parse'

const tradeFiles = import.meta.glob('/journal/trades/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const dayFiles = import.meta.glob('/journal/days/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const noteFiles = import.meta.glob('/notes/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const noteAssets = import.meta.glob('/notes/**/*.{svg,png,jpg,jpeg,webp,gif}', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const screenshotFiles = import.meta.glob('/journal/screenshots/**/*.{png,jpg,jpeg,webp,gif,svg}', { query: '?url', import: 'default', eager: true }) as Record<string, string>

const baseName = (path: string) => path.split('/').pop()!.replace(/\.md$/, '')

export const trades: Trade[] = sortByDate(Object.entries(tradeFiles).map(([path, raw]) => parseTrade(baseName(path), raw)))

export const days: DayEntry[] = sortByDate(Object.entries(dayFiles).map(([path, raw]) => parseDay(baseName(path), raw)))

export interface Note {
  path: string // 相对 notes/ 的路径，如 ict/README.md
  category: string
  title: string
  body: string
}

export const notes: Note[] = Object.entries(noteFiles)
  .map(([path, body]) => {
    const rel = path.replace(/^\/notes\//, '')
    const title = /^#\s+(.+)$/m.exec(body)?.[1] ?? baseName(path)
    return { path: rel, category: rel.includes('/') ? rel.split('/')[0] : '其他', title, body }
  })
  .sort((a, b) => a.path.localeCompare(b.path))

/** 截图在 frontmatter 里写文件名（或相对 journal/screenshots/ 的路径） */
export function screenshotUrl(name: string): string | undefined {
  return screenshotFiles[`/journal/screenshots/${name}`]
}

/** 笔记中的图片，path 为相对仓库根目录的路径，如 notes/ict/img/fvg.svg */
export function noteAssetUrl(path: string): string | undefined {
  return noteAssets[`/${path}`]
}
