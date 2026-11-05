// x-watch 的纯函数：页面提取（在浏览器里执行）、新帖判断、Telegram 消息格式。

export type Source = 'posts' | 'replies'

export interface Post {
  id: string
  handle: string
  date: string // ISO
  text: string
  quote: string // 引用推文的正文
  replyTo: string // 「回复 @xxx」里的账号，取不到为空
  parent: { handle: string; text: string } | null // 时间线上紧挨在上面、用连接线连着的那条（被回复的推文）
  card: string // 链接卡片的标题
  photos: string[]
  hasVideo: boolean
  truncated: boolean
}

/** 每个「账号/页面」已见过的帖子 id；没有这个 key 表示还没初始化 */
export type State = Record<string, string[]>

export const MAX_AGE_MS = 24 * 3600_000 // 超过这个时间的帖子不推送（时间线不严格按时间排序，旧帖可能被顶上来）
const MAX_SEEN = 300

export const stateKey = (handle: string, source: Source) => `${handle.toLowerCase()}/${source}`

/**
 * 在浏览器里执行（通过 toString 传给 DevTools），只能用浏览器 API，辅助函数要写在函数体内。
 * 只取作者是 handle 的推文；转推的链接指向原作者，会被自然排除。
 */
export function extractTimeline(handle: string): Post[] {
  // 逐节点拼正文：innerText 会在 @提及 前后多出换行，也会丢掉用 <img> 显示的 emoji
  const textOf = (el: Element | null | undefined): string => {
    let s = ''
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue
      else if (n.nodeName === 'IMG') s += (n as HTMLImageElement).alt
      else if (n.nodeName === 'BR') s += '\n'
      else n.childNodes.forEach(walk)
    }
    if (el) walk(el)
    return s.trim()
  }
  // 头像下方有 2px 宽的竖线 = 和下一条是同一个对话串
  const linkedBelow = (art: Element) => {
    const col = art.querySelector('[data-testid="Tweet-User-Avatar"]')?.parentElement
    return !!col && [...col.querySelectorAll('div')].some((d) => getComputedStyle(d).width === '2px')
  }

  const rows = [...document.querySelectorAll('article[data-testid="tweet"]')].map((art) => {
    const timeEl = art.querySelector('time')
    const m = (timeEl?.closest('a')?.getAttribute('href') ?? '').match(/^\/([^/]+)\/status\/(\d+)/)
    const texts = art.querySelectorAll('[data-testid="tweetText"]')
    return { art, timeEl, m, text: textOf(texts[0]), quote: textOf(texts[1]) }
  })

  const out: Post[] = []
  rows.forEach(({ art, timeEl, m, text, quote }, i) => {
    if (!timeEl || !m || m[1].toLowerCase() !== handle.toLowerCase()) return
    const prev = rows[i - 1]
    const parent = prev?.m && linkedBelow(prev.art) ? { handle: prev.m[1], text: prev.text } : null
    const replyLine = [...art.querySelectorAll<HTMLElement>('div')].find((d) => /^(Replying to|回复)\s*@/.test(d.innerText ?? ''))
    const card = art.querySelector<HTMLElement>('[data-testid="card.wrapper"]')
    out.push({
      id: m[2],
      handle: m[1],
      date: timeEl.getAttribute('datetime') ?? '',
      text,
      quote,
      replyTo: replyLine?.innerText.match(/@(\w+)/)?.[1] ?? '',
      parent,
      card: card ? (card.innerText.split('\n').map((s) => s.trim()).filter(Boolean).at(-1) ?? '') : '',
      photos: [...art.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img')].map((img) => img.src),
      hasVideo: !!art.querySelector('video, [data-testid="videoPlayer"]'),
      truncated: !!art.querySelector('[data-testid="tweet-text-show-more-link"]'),
    })
  })
  return out
}

/** 在浏览器里执行：原帖页里按开头文字找到完整正文（原帖页的时间链接格式不固定） */
export function extractFullText(head: string): string {
  const textOf = (el: Element): string => {
    let s = ''
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue
      else if (n.nodeName === 'IMG') s += (n as HTMLImageElement).alt
      else if (n.nodeName === 'BR') s += '\n'
      else n.childNodes.forEach(walk)
    }
    walk(el)
    return s.trim()
  }
  for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
    const el = art.querySelector('[data-testid="tweetText"]')
    if (!el || art.querySelector('[data-testid="tweet-text-show-more-link"]')) continue
    const text = textOf(el)
    if (text.startsWith(head)) return text
  }
  return ''
}

/**
 * 在浏览器里执行：页面状态。challenge = Cloudflare 安全验证页；
 * fresh = 没有被标记成「跳转前就在」的推文数（跳转前给旧推文加 data-xw-old，避免把上一页的内容当成新页面）。
 */
export function pageStatus(): { challenge: boolean; fresh: number } {
  const challenge =
    /just a moment|安全验证|security verification/i.test(document.title + ' ' + (document.body?.innerText ?? '').slice(0, 300)) ||
    !!document.querySelector('iframe[src*="challenges.cloudflare.com"], script[src*="/cdn-cgi/challenge-platform/"], #challenge-form, .cf-turnstile')
  return { challenge, fresh: document.querySelectorAll('article[data-testid="tweet"]:not([data-xw-old])').length }
}

/**
 * 下一轮前的等待时长：在 base 的 60%～140% 之间随机，另有 10% 的概率「走开一会儿」，等 2～3 倍，
 * 让请求间隔没有固定规律。rand 是 [0, 1) 随机数，方便测试。
 */
export function nextDelay(base: number, rand: () => number = Math.random): number {
  if (rand() < 0.1) return Math.round(base * (2 + rand()))
  return Math.round(base * (0.6 + rand() * 0.8))
}

/** 遇到安全验证后的第 n 次（从 1 开始）暂停时长：30 分钟起，每次翻倍，最多 2 小时 */
export const challengeBackoff = (n: number) => Math.min(2 * 3600_000, 30 * 60_000 * 2 ** Math.max(0, n - 1))

/**
 * 返回需要推送的新帖（按时间升序）。第一次见到某个 key 时只记录、不推送，避免把历史帖子全发一遍。
 * 不修改 state；推送成功后再调用 markSeen。
 */
export function pickNew(state: State, key: string, items: Post[], now: number): Post[] {
  const seen = state[key]
  if (!seen) return []
  const set = new Set(seen)
  const fresh = new Map<string, Post>()
  for (const p of items) {
    if (set.has(p.id) || fresh.has(p.id)) continue
    const t = Date.parse(p.date)
    if (Number.isNaN(t) || now - t > MAX_AGE_MS) continue
    fresh.set(p.id, p)
  }
  return [...fresh.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function markSeen(state: State, key: string, ids: string[]): void {
  const seen = state[key] ?? []
  for (const id of ids) if (!seen.includes(id)) seen.push(id)
  state[key] = seen.slice(-MAX_SEEN)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)
/** 合并多余空行，最多保留一个空行 */
const tidy = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

/** 帖子时间按 +08:00 显示 */
export const fmtTime = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')

/**
 * Telegram HTML 格式消息：标题行 → 被回复的原文（引用块）→ 正文 → 引用推文 → 媒体 / 链接。
 * limit 是正文最大字数（sendPhoto 的 caption 只有 1024）。
 */
export function formatMessage(p: Post, limit = 3000): string {
  const user = `<a href="https://x.com/${p.handle}"><b>${esc(p.handle)}</b></a>`
  const target = p.parent?.handle ?? p.replyTo
  const self = !!target && target.toLowerCase() === p.handle.toLowerCase()
  // 回复页上没有回复对象的是对话串开头的原创帖
  const head =
    !target
      ? `📝 ${user} 发帖`
      : self
        ? `🧵 ${user} 续帖`
        : `💬 ${user} 回复 @${esc(target)}`
  const lines = [`${head}  ·  <i>${fmtTime(p.date)}</i>`]

  if (p.parent && !self) {
    const ctx = tidy(p.parent.text)
    lines.push(`<blockquote>${ctx ? esc(cut(ctx, Math.min(280, limit / 3))) : '<i>（无文字）</i>'}</blockquote>`)
  }

  const body = tidy(p.text)
  lines.push(body ? esc(cut(body, limit)) : p.card || p.photos.length || p.hasVideo ? '' : '<i>（无文字）</i>')
  if (p.quote) lines.push(`<b>引用：</b>\n<blockquote>${esc(cut(tidy(p.quote), Math.min(400, limit / 3)))}</blockquote>`)

  const extras = [
    p.card && `🔗 ${esc(cut(p.card, 120))}`,
    p.photos.length > 1 && `🖼 共 ${p.photos.length} 张图`,
    p.photos.length === 1 && !p.text && '🖼 图片',
    p.hasVideo && '🎬 视频',
    p.truncated && '✂️ 长帖，正文不全',
  ].filter(Boolean)
  lines.push([...extras, `<a href="https://x.com/${p.handle}/status/${p.id}">查看原帖 ↗</a>`].join('\n'))
  return lines.filter(Boolean).join('\n\n')
}

/** X 图片地址换成大图 */
export const largePhoto = (src: string) => (/[?&]name=/.test(src) ? src.replace(/([?&]name=)\w+/, '$1large') : src)
