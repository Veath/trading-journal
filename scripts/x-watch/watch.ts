// 用法：pnpm x:watch [--every 180] [--once] [--headless] [--test]
// 轮询 watchlist.ts 里账号的「帖子」和「回复」页，有新内容时推送到 Telegram 机器人。
// 用 data/x-watch/browser 这个独立的 Chrome 用户目录（gitignore），第一次运行会打开普通 Chrome 的 X 登录页（支持 Google 登录），登录一次后会记住。
// 配置放在 .env.local（gitignore）：TG_BOT_TOKEN=...、TG_CHAT_ID=...
// 只读 X 页面，不点赞、不转发、不发帖。已推送记录在 data/x-watch/state.json。
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHROME, closeBrowser, openBrowser, type Cdp } from './cdp.ts'
import {
  extractFullText,
  extractTimeline,
  formatMessage,
  largePhoto,
  markSeen,
  pickNew,
  stateKey,
  type Post,
  type Source,
  type State,
} from './posts.ts'
import { HANDLES } from './watchlist.ts'

const ROOT = join(import.meta.dirname, '../..')
const DATA = join(ROOT, 'data/x-watch')
const PROFILE = join(DATA, 'browser')
const STATE_FILE = join(DATA, 'state.json')
const ENV_FILE = join(ROOT, '.env.local')

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const EVERY = Math.max(60, Number(option('every') ?? 180)) * 1000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = (ms: number) => ms + Math.random() * ms * 0.5
const log = (...a: unknown[]) => console.log(new Date().toTimeString().slice(0, 8), ...a)

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
const TOKEN = process.env.TG_BOT_TOKEN
const CHAT = process.env.TG_CHAT_ID
if (!TOKEN || !CHAT) {
  console.error('缺少 TG_BOT_TOKEN / TG_CHAT_ID，请写在 .env.local')
  process.exit(1)
}

async function tg(method: string, body: object): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, ...body }),
    signal: AbortSignal.timeout(20_000),
  })
  const json = (await res.json()) as { ok: boolean; description?: string; parameters?: { retry_after?: number } }
  if (json.ok) return
  if (json.parameters?.retry_after) {
    await sleep(json.parameters.retry_after * 1000)
    return tg(method, body)
  }
  throw new Error(`Telegram ${method}: ${json.description}`)
}

async function push(p: Post, source: Source) {
  if (p.photos.length) {
    try {
      return await tg('sendPhoto', { photo: largePhoto(p.photos[0]), caption: formatMessage(p, source, 700), parse_mode: 'HTML' })
    } catch (e) {
      log(`  图片发送失败，改发文字：${(e as Error).message}`)
    }
  }
  await tg('sendMessage', { text: formatMessage(p, source), parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
}

const loadState = (): State => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {})
const saveState = (s: State) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))

async function loggedIn(cdp: Cdp) {
  const { cookies } = await cdp.send<{ cookies: { name: string }[] }>('Network.getCookies', { urls: ['https://x.com'] })
  return cookies.some((c) => c.name === 'auth_token')
}

/** 直接读用户目录里的 Cookies 库（cookie 名不加密），判断有没有 X 的登录 cookie */
function hasAuthCookie(): boolean {
  const db = join(PROFILE, 'Default/Cookies')
  if (!existsSync(db)) return false
  const tmp = join(DATA, 'cookies-check.db')
  try {
    copyFileSync(db, tmp)
    const out = execFileSync('sqlite3', [tmp, "select count(*) from cookies where host_key like '%x.com' and name = 'auth_token'"])
    return Number(String(out).trim()) > 0
  } catch {
    return false
  } finally {
    rmSync(tmp, { force: true })
  }
}

/**
 * Google 登录会拒绝开着远程调试的浏览器（「此浏览器或应用可能不安全」），
 * 所以登录时用同一个用户目录启动普通 Chrome（不开调试端口），检测到登录 cookie 后关掉，再以监控模式重开。
 */
async function ensureLogin(cdp: Cdp): Promise<Cdp> {
  if (await loggedIn(cdp)) return cdp
  if (flag('headless')) throw new Error('X 未登录：先不加 --headless 运行一次，在弹出的 Chrome 里登录')
  await closeBrowser(PROFILE, cdp)
  const chrome = spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', 'https://x.com/i/flow/login'], {
    stdio: 'ignore',
  })
  log('X 未登录：请在弹出的 Chrome 窗口里登录（可以用 Google 登录，只需一次）。登录成功后窗口会自动关闭并开始监控…')
  while (!hasAuthCookie()) {
    if (chrome.exitCode != null) throw new Error('登录窗口已关闭，未检测到登录，请重新运行')
    await sleep(5000)
  }
  await sleep(3000)
  chrome.kill('SIGTERM') // Chrome 收到 SIGTERM 会正常退出并写盘
  await once(chrome, 'exit')
  log('已登录，切换到监控模式')
  const next = await openBrowser(PROFILE, false)
  if (!(await loggedIn(next))) throw new Error('登录状态没有保存下来，请重新运行')
  return next
}

/** 打开页面并等推文加载出来；返回 false 表示超时（限流、页面出错或确实没有内容） */
async function open(cdp: Cdp, url: string): Promise<boolean> {
  await cdp.send('Page.navigate', { url })
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    const n = await cdp.evaluate(() => document.querySelectorAll('article[data-testid="tweet"]').length, null)
    if (n > 0) {
      await sleep(1500) // 等后面几条也渲染出来
      return true
    }
  }
  return false
}

async function fillTruncated(cdp: Cdp, p: Post) {
  if (!p.truncated || !p.text) return
  if (!(await open(cdp, `https://x.com/${p.handle}/status/${p.id}`))) return
  const full = await cdp.evaluate(extractFullText, p.text.slice(0, 20))
  if (full.length > p.text.length) Object.assign(p, { text: full, truncated: false })
}

async function cycle(cdp: Cdp, state: State) {
  for (const handle of HANDLES) {
    for (const source of ['posts', 'replies'] as const) {
      const url = `https://x.com/${handle}${source === 'replies' ? '/with_replies' : ''}`
      const key = stateKey(handle, source)
      if (!(await open(cdp, url))) {
        log(`@${handle} ${source}：页面没有加载出推文，跳过（可能被限流）`)
        continue
      }
      const items = await cdp.evaluate(extractTimeline, handle)
      if (!state[key]) {
        if (items.length) {
          markSeen(state, key, items.map((p) => p.id))
          saveState(state)
          log(`@${handle} ${source}：首次运行，记录现有 ${items.length} 条，不推送`)
        }
      } else {
        const fresh = pickNew(state, key, items, Date.now())
        for (const p of fresh) {
          await fillTruncated(cdp, p)
          try {
            await push(p, source)
            markSeen(state, key, [p.id])
            saveState(state)
            log(`@${handle} ${source}：已推送 ${p.id} ${p.text.slice(0, 40).replace(/\n/g, ' ')}`)
          } catch (e) {
            log(`@${handle} ${source}：推送失败，下轮重试：${(e as Error).message}`)
          }
        }
      }
      await sleep(jitter(2500))
    }
  }
}

async function main() {
  if (flag('test')) {
    await tg('sendMessage', { text: 'x-watch 测试消息：Telegram 推送正常。' })
    log('测试消息已发送')
    return
  }
  mkdirSync(PROFILE, { recursive: true })
  const cdp = await ensureLogin(await openBrowser(PROFILE, flag('headless')))
  const state = loadState()
  log(`监控 ${HANDLES.map((h) => `@${h}`).join(' ')}，每 ${EVERY / 1000} 秒一轮`)
  while (true) {
    const start = Date.now()
    try {
      await cycle(cdp, state)
    } catch (e) {
      if (cdp.closed) throw new Error('Chrome 已关闭，监控停止')
      log(`本轮出错：${(e as Error).message}`)
    }
    if (flag('once')) break
    await sleep(Math.max(10_000, jitter(EVERY) - (Date.now() - start)))
  }
  cdp.close()
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
