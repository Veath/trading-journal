// 用法：pnpm x:watch [--every 180] [--once] [--headless] [--test]
// 轮询 watchlist.ts 里账号的「帖子」和「回复」页，有新内容时推送到 Telegram 机器人。
// 用 data/x-watch/browser 这个独立的 Chrome 用户目录（gitignore），第一次运行会打开普通 Chrome 的 X 登录页（支持 Google 登录），登录一次后会记住。
// 配置放在 .env.local（gitignore）：TG_BOT_TOKEN=...、TG_CHAT_ID=...
// 只读 X 页面，不点赞、不转发、不发帖。已推送记录在 data/x-watch/state.json。
// 为了少触发 Cloudflare 安全验证：页面之间在站内跳转、最多 30 分钟整页刷新一次；遇到验证就停下（有窗口时等你手动点验证，无头模式按 30 分钟起翻倍暂停）。
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHROME, closeBrowser, openBrowser, type Cdp } from './cdp.ts'
import {
  challengeBackoff,
  extractFullText,
  extractTimeline,
  formatMessage,
  largePhoto,
  markSeen,
  nextDelay,
  pageStatus,
  pickNew,
  stateKey,
  type Post,
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

async function push(p: Post) {
  if (p.photos.length) {
    try {
      return await tg('sendPhoto', { photo: largePhoto(p.photos[0]), caption: formatMessage(p, 700), parse_mode: 'HTML' })
    } catch (e) {
      log(`  图片发送失败，改发文字：${(e as Error).message}`)
    }
  }
  await tg('sendMessage', { text: formatMessage(p), parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
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

/** 页面是 Cloudflare 安全验证页 */
class ChallengeError extends Error {}

const HARD_EVERY = 30 * 60_000 // 整页刷新的最短间隔，其余跳转都在站内完成
let lastHardLoad = 0

/**
 * 打开页面并等推文加载出来；返回 false 表示超时（限流、页面出错或确实没有内容），遇到安全验证抛 ChallengeError。
 * 默认在 X 的单页应用里用 history.pushState 跳转：只请求 X 的数据接口、不重新请求整页，
 * Cloudflare 的验证基本只出现在整页请求上，这样能大幅减少触发。距上次整页刷新超过 HARD_EVERY 或站内跳转不可用时才整页加载。
 */
async function open(cdp: Cdp, url: string): Promise<boolean> {
  const path = new URL(url).pathname
  const hard = Date.now() - lastHardLoad > HARD_EVERY
  const navigated = await cdp
    .evaluate(
      ({ path, hard }) => {
        document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => a.setAttribute('data-xw-old', ''))
        // 已在目标页时站内跳转不会重新拉数据，只能整页刷新
        if (hard || location.hostname !== 'x.com' || location.pathname === path || !document.querySelector('[data-testid="primaryColumn"]'))
          return false
        history.pushState({}, '', path)
        dispatchEvent(new PopStateEvent('popstate', { state: {} }))
        return true
      },
      { path, hard },
    )
    .catch(() => false)
  if (!navigated) {
    await cdp.send('Page.navigate', { url })
    lastHardLoad = Date.now()
  }
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    const s = await cdp.evaluate(pageStatus, null).catch(() => null) // 整页跳转中途可能取不到
    if (s?.challenge) throw new ChallengeError('X 弹出了 Cloudflare 安全验证')
    if (s && s.fresh > 0) {
      await sleep(1500) // 等后面几条也渲染出来
      return true
    }
  }
  return false
}

/** 等安全验证页消失（有窗口时由用户手动点验证） */
async function waitChallengeSolved(cdp: Cdp) {
  while (true) {
    await sleep(15_000)
    const s = await cdp.evaluate(pageStatus, null).catch(() => null)
    if (s && !s.challenge) return
  }
}

async function fillTruncated(cdp: Cdp, p: Post) {
  if (!p.truncated || !p.text) return
  if (!(await open(cdp, `https://x.com/${p.handle}/status/${p.id}`))) return
  const full = await cdp.evaluate(extractFullText, p.text.slice(0, 20))
  if (full.length > p.text.length) Object.assign(p, { text: full, truncated: false })
}

const shuffle = <T>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v)

async function cycle(cdp: Cdp, state: State) {
  for (const handle of shuffle(HANDLES)) {
    for (const source of shuffle(['posts', 'replies'] as const)) {
      const url = `https://x.com/${handle}${source === 'replies' ? '/with_replies' : ''}`
      const key = stateKey(handle, source)
      const other = stateKey(handle, source === 'posts' ? 'replies' : 'posts')
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
        // 回复页会带出自己的原创帖（对话串的开头），帖子页推过的不再推
        const pushed = new Set(state[other] ?? [])
        const fresh = pickNew(state, key, items, Date.now()).filter((p) => !pushed.has(p.id))
        for (const p of fresh) {
          await fillTruncated(cdp, p)
          try {
            await push(p)
            markSeen(state, key, [p.id])
            if (state[other]) markSeen(state, other, [p.id])
            saveState(state)
            log(`@${handle} ${source}：已推送 ${p.id} ${p.text.slice(0, 40).replace(/\n/g, ' ')}`)
          } catch (e) {
            log(`@${handle} ${source}：推送失败，下轮重试：${(e as Error).message}`)
          }
        }
      }
      await sleep(2000 + Math.random() * 6000) // 页面之间停 2～8 秒
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
  log(`监控 ${HANDLES.map((h) => `@${h}`).join(' ')}，约每 ${EVERY / 1000} 秒一轮（随机浮动）`)
  let challenges = 0 // 连续遇到安全验证的次数
  let slowUntil = 0 // 验证过后一段时间内放慢轮询
  while (true) {
    const start = Date.now()
    try {
      await cycle(cdp, state)
      challenges = 0
    } catch (e) {
      if (cdp.closed) throw new Error('Chrome 已关闭，监控停止')
      if (!(e instanceof ChallengeError)) log(`本轮出错：${(e as Error).message}`)
      else {
        challenges++
        slowUntil = Date.now() + 2 * 3600_000
        lastHardLoad = 0 // 恢复后先整页刷新一次
        const headless = flag('headless')
        const wait = challengeBackoff(challenges)
        const msg = headless
          ? `${e.message}，暂停 ${wait / 60_000} 分钟后重试。频繁出现时去掉 --headless 运行，在窗口里手动验证。`
          : `${e.message}，请在 x-watch 的 Chrome 窗口里点「验证您是真人」，通过后自动继续。`
        log(msg)
        if (challenges === 1) await tg('sendMessage', { text: `⚠️ x-watch：${msg}` }).catch(() => {})
        if (flag('once')) break
        if (headless) await sleep(wait)
        else {
          await waitChallengeSolved(cdp)
          log('验证已通过，接下来 2 小时放慢轮询')
        }
        continue
      }
    }
    if (flag('once')) break
    const every = Date.now() < slowUntil ? EVERY * 2 : EVERY
    const wait = Math.max(10_000, nextDelay(every) - (Date.now() - start))
    log(`下一轮在 ${Math.round(wait / 1000)} 秒后`)
    await sleep(wait)
  }
  cdp.close()
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
