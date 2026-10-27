// 用法：pnpm mentor:ingest [文件.json] [--handle Keyshotvv]
// 合并采集结果到 data/mentors/<handle>/posts.json，有新内容时生成待提炼清单 data/mentors/<handle>/digest-YYYYMMDD-HHMM.md
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { dataDir, isSubstantive, loadStore, parseArgs, saveStore, type Post } from './store.ts'

const { handle, rest } = parseArgs(process.argv.slice(2))

function latestDownload(): string | undefined {
  const dir = join(homedir(), 'Downloads')
  if (!existsSync(dir)) return undefined
  const prefix = `${handle.toLowerCase()}-`
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

const file = rest[0] ?? latestDownload()
if (!file || !existsSync(file)) {
  console.error('找不到采集文件。先运行 pnpm mentor:collect，或指定文件路径。')
  process.exit(1)
}

const input = JSON.parse(readFileSync(file, 'utf8')) as { handle: string; collectedAt: string; posts: Post[] }
if (input.handle.toLowerCase() !== handle.toLowerCase()) {
  console.error(`文件属于 @${input.handle}，与 --handle ${handle} 不一致`)
  process.exit(1)
}

const store = loadStore(handle)
const known = new Set(store.posts.map((p) => p.id))
const added = input.posts.filter((p) => !known.has(p.id))
store.posts = [...store.posts, ...added].sort((a, b) => a.date.localeCompare(b.date))
store.lastCollectedAt = input.collectedAt
saveStore(store)

console.log(`@${handle}：新增 ${added.length} 条（重复 ${input.posts.length - added.length} 条），累计 ${store.posts.length} 条`)
if (added.length === 0) {
  console.log('没有新内容，不生成待提炼清单')
  process.exit(0)
}

const substantive = added.filter((p) => isSubstantive(p))
const day = input.collectedAt.slice(0, 10)
// 文件名带采集时间，同一天多次采集不会互相覆盖
const stamp = input.collectedAt.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
const digestFile = join(dataDir(handle), `digest-${stamp}.md`)
const lines = [
  `# @${handle} 新增内容 ${day}`,
  '',
  `来源：${file}`,
  `新增 ${added.length} 条，其中值得提炼 ${substantive.length} 条（≥20 字或含交易关键词）。`,
  '',
  '用 keyshot-mentor skill 的「更新导师资料」流程处理：转述后更新 notes/mentors/ 下的规则 / 心态 / 原帖索引，只引用下表中的真实链接。',
  '',
  ...substantive.map((p) => `- ${p.date.slice(0, 10)}${p.hasMedia ? ' [图]' : ''} ${p.url}\n  ${p.text.replace(/\n+/g, ' / ')}`),
  '',
]
writeFileSync(digestFile, lines.join('\n'))

console.log(`值得提炼 ${substantive.length} 条 → ${digestFile}`)
