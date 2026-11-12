// x-watch 的纯函数：页面提取（在浏览器里执行）、新帖判断、Telegram 消息格式。

export type Source = 'posts' | 'replies'

export interface Post {
  id: string
  handle: string
  name: string // 昵称（显示名），取不到为空
  date: string // ISO
  text: string
  quote: string // 引用推文的正文
  replyTo: string // 「回复 @xxx」里的账号，取不到为空
  parent: { handle: string; name: string; text: string } | null // 时间线上紧挨在上面、用连接线连着的那条（被回复的推文）
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

/** 在浏览器里执行：采集前将 X 自动翻译的帖子切回原文。 */
export async function restoreOriginalText(): Promise<boolean> {
  const originalButtons = () =>
    [...document.querySelectorAll<HTMLElement>('article[data-testid="tweet"] button, article[data-testid="tweet"] [role="button"]')].filter(
      (button) => /^(?:show original|显示原文|顯示原文)$/i.test((button.getAttribute('aria-label') || button.textContent || '').trim()),
    )
  const clicked = new WeakSet<HTMLElement>()
  // 切回原文会触发列表重新排版，并可能加载新的译文按钮，不能只处理最初的一批。
  for (let i = 0; i < 20; i++) {
    const buttons = originalButtons()
    if (!buttons.length) return true
    for (const button of buttons) {
      if (clicked.has(button)) continue
      clicked.add(button)
      button.click()
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  // 等待 X 完成正文替换；失败时让调用方跳过，避免把译文当原文推送。
  return !originalButtons().length
}

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
    // User-Name 里第一个链接是昵称（引用推文的 User-Name 在后面，不会先匹配到）
    const name = textOf(art.querySelector('[data-testid="User-Name"] a'))
    return { art, timeEl, m, name, text: textOf(texts[0]), quote: textOf(texts[1]) }
  })

  const out: Post[] = []
  rows.forEach(({ art, timeEl, m, name, text, quote }, i) => {
    if (!timeEl || !m || m[1].toLowerCase() !== handle.toLowerCase()) return
    const prev = rows[i - 1]
    const parent = prev?.m && linkedBelow(prev.art) ? { handle: prev.m[1], name: prev.name, text: prev.text } : null
    const replyLine = [...art.querySelectorAll<HTMLElement>('div')].find((d) => /^(Replying to|回复)\s*@/.test(d.innerText ?? ''))
    const card = art.querySelector<HTMLElement>('[data-testid="card.wrapper"]')
    out.push({
      id: m[2],
      handle: m[1],
      name,
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
 * 在浏览器里执行：页面状态。challenge = Cloudflare 安全验证页，protected = 目标账号的帖子受保护。
 * fresh = 没有被标记成「跳转前就在」的推文数（跳转前给旧推文加 data-xw-old，避免把上一页的内容当成新页面）。
 */
export function pageStatus(handle: string): { challenge: boolean; fresh: number; protected: boolean } {
  // 正常的 X 页面也会注入 /cdn-cgi/challenge-platform/ 脚本，不能当特征；验证页上没有 X 的应用（#react-root）
  const challenge =
    !document.querySelector('#react-root') &&
    ('_cf_chl_opt' in window ||
      /just a moment|安全验证|security verification|请稍候/i.test(document.title + ' ' + (document.body?.innerText ?? '').slice(0, 300)) ||
      !!document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-form, .cf-turnstile'))
  // 用受保护帖子的帮助链接识别提示，并核对账号，避免站内跳转时读到上一页的提示。
  const notice = document.querySelector('[data-testid="primaryColumn"] [data-testid="empty_state_body_text"]')
  const noticeHandle = notice?.textContent?.match(/@(\w+)/)?.[1]
  const protectedPosts =
    noticeHandle?.toLowerCase() === handle.toLowerCase() && !!notice?.querySelector('a[href$="/articles/14016"]')
  return {
    challenge,
    fresh: document.querySelectorAll('article[data-testid="tweet"]:not([data-xw-old])').length,
    protected: protectedPosts,
  }
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

/** 仅过滤 Fred（现用 fredtradesnq）的明确推广，连同本人广告对话串的续帖一起处理。 */
export function isPromotion(p: Post): boolean {
  const handles = ['fredtradesnq', 'fjtrades', 'fredtrades']
  if (!handles.includes(p.handle.toLowerCase())) return false
  const parentText = p.parent && handles.includes(p.parent.handle.toLowerCase()) ? p.parent.text : ''
  const text = [p.text, p.card, parentText].join('\n')
  const code =
    /\bcode\s*[:=-]?\s*["'“‘]?\s*fred\b/i.test(text) ||
    /\b(?:promo|discount|coupon|referral)\s+code\b/i.test(text) ||
    /\b(?:use|using)\s+my\s+code\b/i.test(text)
  // 返佣参数和路径来自实际推广帖，避免把 Reddit 的 /r/ 等普通链接当成返佣。
  const referral =
    /(?:[?&](?:ref(?:erral)?|aff(?:iliate)?|via)=|\/ref\/)fred\b/i.test(text) ||
    /vestmarkets\.com\/r\/vnfred\b/i.test(text)
  const product =
    /\b(?:prop\s+firms?|funded\s+accounts?|eval(?:uation)?s?)\b/i.test(text) ||
    /\b(?:lucid(?:flex|trading)?|fundyouredge|fye|alpha\s+funded|vest(?:markets|exchange)?)\b/i.test(text)
  const partialExit = /\b(?:took|taking|trimmed|scaled)\s+(?:another\s+)?\d+(?:\.\d+)?\s*%\s*off\b/i.test(text)
  const offer = /\b(?:bogo|sale|giveaway|coupon)\b/i.test(text) || (/\b\d+(?:\.\d+)?\s*%\s*off\b/i.test(text) && !partialExit)
  const invitation = /\bcheck\s+out\s+(?:lucid|fye|fundyouredge|alpha|vest)\b|\bsign\s*up\b/i.test(text)
  return code || referral || (product && (offer || invitation))
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
  const user = `<a href="https://x.com/${p.handle}"><b>${esc(p.name || p.handle)}</b></a>${p.name ? ` @${esc(p.handle)}` : ''}`
  const target = p.parent?.handle ?? p.replyTo
  const targetName = p.parent?.name ? `${esc(p.parent.name)} @${esc(target)}` : `@${esc(target)}`
  const self = !!target && target.toLowerCase() === p.handle.toLowerCase()
  // 回复页上没有回复对象的是对话串开头的原创帖
  const head =
    !target
      ? `📝 ${user} 发帖`
      : self
        ? `🧵 ${user} 续帖`
        : `💬 ${user} 回复 ${targetName}`
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
