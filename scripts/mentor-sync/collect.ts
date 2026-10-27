// 用法：pnpm mentor:collect [--handle Keyshotvv] [--since 2026-10-01] [--no-download]
// 生成浏览器采集脚本，打印并复制到剪贴板（macOS）。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadStore, nextSince, parseArgs } from './store.ts'

const { handle, flags } = parseArgs(process.argv.slice(2))
const since = flags.since ? new Date(flags.since).toISOString() : nextSince(loadStore(handle))
const script = readFileSync(join(import.meta.dirname, 'collector.js'), 'utf8')
  .replaceAll('__HANDLE__', handle)
  .replaceAll('__SINCE__', since)
  .replaceAll('__DOWNLOAD__', flags['no-download'] ? 'false' : 'true')

let copied = false
try {
  execFileSync('pbcopy', { input: script })
  copied = true
} catch {
  // 非 macOS：手动复制下方脚本
}

if (flags.print) console.log(script)
console.log(`采集 @${handle} 自 ${since} 之后的内容`)
console.log(copied ? '✓ 采集脚本已复制到剪贴板' : '复制下面的脚本：\n\n' + script)
console.log(`
下一步：
  1. 在已登录的浏览器打开 https://x.com/${handle}/with_replies
  2. 打开开发者工具控制台（Cmd+Option+J），粘贴并回车，等待自动滚动结束
  3. 下载的 ${handle.toLowerCase()}-YYYY-MM-DD.json 会保存到「下载」目录
  4. 运行 pnpm mentor:ingest（自动读取「下载」目录中最新的文件）`)
