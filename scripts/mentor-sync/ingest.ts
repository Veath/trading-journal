// 用法：pnpm mentor:ingest [文件.json ...] [--handle Keyshotvv]
// 合并采集结果到 data/mentors/<handle>/posts.json，有新内容时生成待提炼清单 data/mentors/<handle>/digest-YYYYMMDD-HHMM.md
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { dataDir, isSubstantive, loadStore, parseArgs, saveStore, type Post } from './store.ts'

const { handle, rest } = parseArgs(process.argv.slice(2))

/** 「下载」目录中帖子、回复各自最新的采集文件 */
function latestDownloads(): string[] {
  const dir = join(homedir(), 'Downloads')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(`${handle.toLowerCase()}-`) && f.endsWith('.json'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  const pick = (source: string) => files.find((f) => f.includes(`-${source}-`))
  return [pick('posts'), pick('replies'), pick('questions')].filter((f) => f !== undefined)
}

interface Input {
  handle: string
  source?: 'posts' | 'replies' | 'questions'
  collectedAt: string
  /** source 为 questions 时只有 id 和 replyTo */
  posts: Post[]
}

const files = rest.length ? rest : latestDownloads()
if (!files.length || files.some((f) => !existsSync(f))) {
  console.error('找不到采集文件。先运行 pnpm mentor:collect，或指定文件路径。')
  process.exit(1)
}

const inputs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Input)
for (const input of inputs) {
  if (input.handle.toLowerCase() !== handle.toLowerCase()) {
    console.error(`文件属于 @${input.handle}，与 --handle ${handle} 不一致`)
    process.exit(1)
  }
}
const incoming = inputs.filter((i) => i.source !== 'questions').flatMap((i) => i.posts)
const answers = inputs.filter((i) => i.source === 'questions').flatMap((i) => i.posts)
const collectedAt = inputs.map((i) => i.collectedAt).sort().at(-1)!

const store = loadStore(handle)
const byId = new Map(store.posts.map((p) => [p.id, p]))
const added: Post[] = []
const answered: Post[] = []
let completed = 0
/** 补上之前没查到的提问；已有的不覆盖 */
const fillReplyTo = (old: Post, replyTo: Post['replyTo']) => {
  if (replyTo && !old.replyTo) {
    old.replyTo = replyTo
    answered.push(old)
  } else if (replyTo === null && old.replyTo === undefined) {
    old.replyTo = null
  }
}
for (const p of answers) {
  const old = byId.get(p.id)
  if (old) fillReplyTo(old, p.replyTo)
}
for (const p of incoming) {
  const old = byId.get(p.id)
  if (old && p.replyTo !== undefined) fillReplyTo(old, p.replyTo)
  if (!old) {
    byId.set(p.id, p)
    added.push(p)
  } else if (old.truncated && !p.truncated && p.text.length > old.text.length) {
    // 补全了之前被截断的长帖
    byId.set(p.id, { ...old, ...p })
    completed++
  } else if (!old.source && p.source) {
    old.source = p.source
  }
}
store.posts = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date))
store.lastCollectedAt = collectedAt
saveStore(store)

const truncated = store.posts.filter((p) => p.truncated).length
console.log(
  `@${handle}：新增 ${added.length} 条，补全长帖 ${completed} 条，补充提问 ${answered.length} 条，累计 ${store.posts.length} 条` +
    (truncated ? `；仍有 ${truncated} 条长帖只有前半段，需要打开原帖补全` : ''),
)
if (added.length === 0 && answered.length === 0) {
  console.log('没有新内容，不生成待提炼清单')
  process.exit(0)
}

// 只补了提问时，清单列出补到提问的回复，用来复查之前的转述
const listed = added.length ? added : answered
const substantive = listed.filter((p) => isSubstantive(p) || (p.replyTo && isSubstantive({ ...p, text: p.replyTo.text })))
const day = collectedAt.slice(0, 10)
// 文件名带采集时间，同一天多次采集不会互相覆盖
const stamp = collectedAt.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
const digestFile = join(dataDir(handle), `digest-${stamp}${added.length ? '' : '-questions'}.md`)
const oneLine = (t: string) => t.replace(/\n+/g, ' / ')
const lines = [
  `# @${handle} 新增内容 ${day}`,
  '',
  `来源：${files.join('、')}`,
  added.length
    ? `新增 ${added.length} 条，其中值得提炼 ${substantive.length} 条（≥20 字或含交易关键词，回复按提问 + 回答算）。`
    : `补充了 ${answered.length} 条回复的提问，其中值得复查 ${substantive.length} 条：对照提问检查之前的转述是否准确，补上当时因缺少上下文跳过的内容。`,
  '',
  '用 keyshot-mentor skill 的「更新导师资料」流程处理：转述后更新 notes/mentors/ 下的规则 / 心态 / 原帖索引，只引用下表中他本人帖子的真实链接。「问：」是别人的提问，只用来理解语境，笔记里转述大意、不写提问者。',
  '',
  ...substantive.map(
    (p) =>
      `- ${p.date.slice(0, 10)}${p.source === 'posts' ? ' [帖子]' : ''}${p.hasMedia ? ' [图]' : ''}${p.truncated ? ' [截断]' : ''} ${p.url}\n` +
      (p.replyTo ? `  问：${oneLine(p.replyTo.text) || '（无文字）'}${p.replyTo.hasMedia ? ' [图]' : ''}\n` : '') +
      `  ${oneLine(p.text)}`,
  ),
  '',
]
writeFileSync(digestFile, lines.join('\n'))

console.log(`值得提炼 ${substantive.length} 条 → ${digestFile}`)
