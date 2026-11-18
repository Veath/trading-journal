// 用法：pnpm mentor:collect [--handle Keyshotvv] [--since 2026-10-01] [--no-download]
//      pnpm mentor:collect --questions 2026-11-13 [--until 2026-11-16]   补采已有回复的提问（replyTo）
// 生成浏览器采集脚本，打印并复制到剪贴板（macOS）。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadStore, needsReplyTo, nextSince, parseArgs } from './store.ts'

const { handle, flags } = parseArgs(process.argv.slice(2))
const store = loadStore(handle)
const since = flags.since ? new Date(flags.since).toISOString() : nextSince(store)
const iso = (d: string) => new Date(d).toISOString()
const backfill = flags.questions
  ? store.posts
      .filter((p) => needsReplyTo(p, iso(flags.questions), flags.until ? iso(flags.until) : '9999'))
      .map((p) => ({ id: p.id, head: p.text.slice(0, 20) }))
  : []
if (flags.questions && !backfill.length) {
  console.log('该时间范围内没有需要补提问的回复')
  process.exit(0)
}
const script = readFileSync(join(import.meta.dirname, 'collector.js'), 'utf8')
  .replaceAll('__HANDLE__', handle)
  .replaceAll('__SINCE__', since)
  .replaceAll('__DOWNLOAD__', flags['no-download'] ? 'false' : 'true')
  .replaceAll('__BACKFILL__', () => JSON.stringify(backfill))

let copied = false
try {
  execFileSync('pbcopy', { input: script })
  copied = true
} catch {
  // 非 macOS：手动复制下方脚本
}

if (flags.print) console.log(script)
if (backfill.length) {
  console.log(`补采 @${handle} ${backfill.length} 条回复的提问`)
  console.log(copied ? '✓ 采集脚本已复制到剪贴板' : '复制下面的脚本：\n\n' + script)
  console.log(`
下一步：
  1. 在已登录的浏览器打开 https://x.com/${handle}/with_replies
  2. 打开开发者工具控制台，粘贴并回车，脚本会逐条打开原帖（约每条 1–2 秒）
  3. 下载的 ${handle.toLowerCase()}-questions-YYYY-MM-DD.json 保存到「下载」目录后，运行 pnpm mentor:ingest`)
  process.exit(0)
}
console.log(`采集 @${handle} 自 ${since} 之后的内容`)
console.log(copied ? '✓ 采集脚本已复制到剪贴板' : '复制下面的脚本：\n\n' + script)
console.log(`
下一步（帖子和回复是两个页面，都要采集）：
  1. 在已登录的浏览器打开 https://x.com/${handle} （帖子）
  2. 打开开发者工具控制台（Cmd+Option+J），粘贴并回车，等待自动滚动结束
  3. 再打开 https://x.com/${handle}/with_replies （回复），重复第 2 步
  4. 下载的 ${handle.toLowerCase()}-posts-YYYY-MM-DD.json 和 ${handle.toLowerCase()}-replies-YYYY-MM-DD.json 会保存到「下载」目录
  5. 运行 pnpm mentor:ingest（自动读取「下载」目录中帖子、回复各自最新的文件）`)
