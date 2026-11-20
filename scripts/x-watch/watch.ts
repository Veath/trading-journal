// 用法：pnpm x:watch [--every 600] [--once] [--headless] [--test]
// 轮询 watchlist.ts 里账号的「帖子」和「回复」页，有新内容时推送到 Telegram 机器人。
// 用 data/x-watch/browser 这个独立的 Chrome 用户目录（gitignore），第一次运行会打开普通 Chrome 的 X 登录页（支持 Google 登录），登录一次后会记住。
// 配置放在 .env.local（gitignore）：TG_BOT_TOKEN=...、TG_CHAT_ID=...
// 只读 X 页面，不点赞、不转发、不发帖。已推送记录在 data/x-watch/state.json。
// 遇到 Cloudflare 安全验证就暂停采集；有窗口时首次交给用户手动处理，连续遇到验证或使用无头模式时退避。
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
  isPromotion,
  largePhoto,
  markSeen,
  nextDelay,
  pageStatus,
  pickNew,
  restoreOriginalText,
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
const EVERY = Math.max(60, Number(option('every') ?? 600)) * 1000

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

/** 直接查用户目录里的 Cookies 库（cookie 名和时间不加密）；sql 只返回一个数字，查不到返回 0 */
function cookieQuery(sql: string): number {
  const db = join(PROFILE, 'Default/Cookies')
  if (!existsSync(db)) return 0
  const tmp = join(DATA, 'cookies-check.db')
  try {
    copyFileSync(db, tmp)
    return Number(String(execFileSync('sqlite3', [tmp, sql])).trim()) || 0
  } catch {
    return 0
  } finally {
    rmSync(tmp, { force: true })
  }
}

const hasAuthCookie = () => cookieQuery("select count(*) from cookies where host_key like '%x.com' and name = 'auth_token'") > 0

/**
 * 暂停监控，用同一个用户目录打开普通 Chrome。登录时可用 done 判断何时自动关闭；
 * 安全验证时等用户退出 Chrome，Cookie 更新不能证明监控已恢复访问。
 */
async function manualStep(url: string, cdp: Cdp, done?: () => boolean): Promise<boolean> {
  await closeBrowser(PROFILE, cdp)
  const chrome = spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', url], { stdio: 'ignore' })
  if (!done) {
    const [code, signal] = await once(chrome, 'exit')
    if (code !== 0) throw new Error(`验证窗口异常退出（${signal ?? `退出码 ${code}`}），监控停止`)
    return true
  }
  while (!done()) {
    if (chrome.exitCode != null) return false
    await sleep(5000)
  }
  await sleep(3000)
  chrome.kill('SIGTERM') // Chrome 收到 SIGTERM 会正常退出并写盘
  await once(chrome, 'exit')
  return true
}

async function ensureLogin(cdp: Cdp): Promise<Cdp> {
  if (await loggedIn(cdp)) return cdp
  if (flag('headless')) throw new Error('X 未登录：先不加 --headless 运行一次，在弹出的 Chrome 里登录')
  log('X 未登录：请在弹出的 Chrome 窗口里登录（可以用 Google 登录，只需一次）。登录成功后窗口会自动关闭并开始监控…')
  if (!(await manualStep('https://x.com/i/flow/login', cdp, hasAuthCookie))) throw new Error('登录窗口已关闭，未检测到登录，请重新运行')
  log('已登录，切换到监控模式')
  const next = await openBrowser(PROFILE, false)
  if (!(await loggedIn(next))) throw new Error('登录状态没有保存下来，请重新运行')
  return next
}

/** 页面是 Cloudflare 安全验证页 */
class ChallengeError extends Error {}

const HARD_EVERY = 2 * 3600_000 // 定时整页刷新的间隔；站内跳转不可用时仍会整页加载
let lastHardLoad = 0

/**
 * 打开页面并等待推文，切回原文后才算加载成功；区分帖子受保护、原文切换失败和超时。遇到安全验证抛 ChallengeError。
 * 优先在 X 的单页应用内跳转，减少整页加载。距上次整页刷新超过 HARD_EVERY 或站内跳转不可用时才整页加载。
 */
async function open(cdp: Cdp, url: string): Promise<'ready' | 'protected' | 'translated' | 'timeout'> {
  const path = new URL(url).pathname
  const handle = path.split('/')[1]
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
    const s = await cdp.evaluate(pageStatus, handle).catch(() => null) // 整页跳转中途可能取不到
    if (s?.challenge) throw new ChallengeError('X 弹出了 Cloudflare 安全验证')
    if (s?.protected) return 'protected'
    if (s && s.fresh > 0) {
      await sleep(1500) // 等后面几条也渲染出来
      return await cdp.evaluate(restoreOriginalText, null) ? 'ready' : 'translated'
    }
  }
  return 'timeout'
}

async function fillTruncated(cdp: Cdp, p: Post) {
  if (!p.truncated || !p.text) return
  if ((await open(cdp, `https://x.com/${p.handle}/status/${p.id}`)) !== 'ready') return
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
      const status = await open(cdp, url)
      if (status === 'protected') {
        log(`@${handle} 的帖子受保护，仅获批准的关注者可见，本轮跳过`)
        break
      }
      if (status === 'timeout') {
        log(`@${handle} ${source}：等待推文加载超时，跳过`)
        continue
      }
      if (status === 'translated') {
        log(`@${handle} ${source}：未能切回原文，跳过以免推送自动译文`)
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
            const filtered = isPromotion(p)
            if (!filtered) await push(p)
            markSeen(state, key, [p.id])
            if (state[other]) markSeen(state, other, [p.id])
            saveState(state)
            if (filtered) log(`@${handle} ${source}：已过滤推广帖 ${p.id}`)
            else log(`@${handle} ${source}：已推送 ${p.id} ${p.text.slice(0, 40).replace(/\n/g, ' ')}`)
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
  const headless = flag('headless')
  const runOnce = flag('once')
  let cdp = await ensureLogin(await openBrowser(PROFILE, headless))
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
        const manual = !runOnce && !headless && challenges === 1
        const wait = challengeBackoff(challenges)
        const msg = runOnce
          ? `${e.message}，本次检查结束。`
          : manual
            ? `${e.message}。请在弹出的 Chrome 窗口手动验证，看到 X 正常页面后按 ⌘Q 退出该 Chrome，脚本会继续监控。`
            : `${e.message}，监控暂停 ${wait / 60_000} 分钟后再试${headless ? '。可去掉 --headless 运行并手动验证' : ''}。`
        log(msg)
        if (challenges === 1) await tg('sendMessage', { text: `⚠️ x-watch：${msg}` }).catch(() => {})
        if (runOnce) break
        if (manual) {
          await manualStep('https://x.com/home', cdp)
          cdp = await openBrowser(PROFILE, false)
          log('验证窗口已退出，接下来 2 小时放慢轮询')
        }
        lastHardLoad = 0 // 恢复后先整页刷新一次
        slowUntil = Date.now() + 2 * 3600_000
        if (!manual) await sleep(wait)
        continue
      }
    }
    if (runOnce) break
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
