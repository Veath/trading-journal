import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Post {
  id: string
  date: string // ISO
  text: string
  hasMedia: boolean
  url: string
}

export interface Store {
  handle: string
  lastCollectedAt: string | null
  posts: Post[]
}

export const ROOT = join(import.meta.dirname, '../..')
/** 原文只保存在本地（data/ 已加入 .gitignore），仓库里只放转述 + 链接 */
export const dataDir = (handle: string) => join(ROOT, 'data/mentors', handle.toLowerCase())

export function parseArgs(argv: string[]): { handle: string; rest: string[]; flags: Record<string, string> } {
  const flags: Record<string, string> = {}
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) flags[a.slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] == null ? 'true' : argv[++i]
    else rest.push(a)
  }
  return { handle: flags.handle ?? 'Keyshotvv', rest, flags }
}

export function loadStore(handle: string): Store {
  const file = join(dataDir(handle), 'posts.json')
  if (!existsSync(file)) return { handle, lastCollectedAt: null, posts: [] }
  return JSON.parse(readFileSync(file, 'utf8')) as Store
}

export function saveStore(store: Store): void {
  const dir = dataDir(store.handle)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'posts.json'), JSON.stringify(store, null, 2) + '\n')
}

/** 下一次采集的起点：已保存的最新一条内容的时间；没有数据时从今年 1 月 1 日开始 */
export function nextSince(store: Store): string {
  const latest = store.posts.map((p) => p.date).sort().at(-1)
  return latest ?? `${new Date().getFullYear()}-01-01T00:00:00.000Z`
}

/** 值得人工 / Claude 阅读的内容：较长的帖子，或包含交易关键词的短回复 */
const KEYWORDS =
  /止损|止盈|流动性|进场|入场|FVG|IFVG|sweep|清扫|DOL|仓位|日线|周线|4H|1H|15M|5M|1M|盈亏比|RR|胜率|保本|BE|CHOCH|MSS|CISD|OB|BISI|SIBI|CRT|SMT|结构|复盘|等高|等低|EQH|EQL|PDH|PDL|亚盘|伦敦|纽约|分批|假突破|通道|楔形|背景|bias|killzone/i

export function isSubstantive(p: Post, minLength = 20): boolean {
  return p.text.length >= minLength || (p.text.length > 0 && KEYWORDS.test(p.text))
}
