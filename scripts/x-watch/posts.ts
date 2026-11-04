// x-watch 的纯函数：页面提取（在浏览器里执行）、新帖判断、Telegram 消息格式。

export type Source = 'posts' | 'replies'

export interface Post {
  id: string
  handle: string
  date: string // ISO
  text: string
  quote: string // 引用推文的正文
  replyTo: string // 「回复 @xxx」里的账号，取不到为空
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
 * 在浏览器里执行（通过 toString 传给 DevTools），只能用浏览器 API。
 * 只取作者是 handle 的推文；转推的链接指向原作者，会被自然排除。
 */
export function extractTimeline(handle: string): Post[] {
  const out: Post[] = []
  for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
    const timeEl = art.querySelector('time')
    const href = timeEl?.closest('a')?.getAttribute('href') ?? ''
    const m = href.match(/^\/([^/]+)\/status\/(\d+)/)
    if (!timeEl || !m || m[1].toLowerCase() !== handle.toLowerCase()) continue
    const texts = art.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')
    const replyLine = [...art.querySelectorAll<HTMLElement>('div')].find((d) =>
      /^(Replying to|回复)\s*@/.test(d.innerText ?? ''),
    )
    out.push({
      id: m[2],
      handle: m[1],
      date: timeEl.getAttribute('datetime') ?? '',
      text: texts[0]?.innerText ?? '',
      quote: texts[1]?.innerText ?? '',
      replyTo: replyLine?.innerText.match(/@(\w+)/)?.[1] ?? '',
      photos: [...art.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img')].map((i) => i.src),
      hasVideo: !!art.querySelector('video, [data-testid="videoPlayer"]'),
      truncated: !!art.querySelector('[data-testid="tweet-text-show-more-link"]'),
    })
  }
  return out
}

/** 在浏览器里执行：原帖页里按开头文字找到完整正文（原帖页的时间链接格式不固定） */
export function extractFullText(head: string): string {
  for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
    const el = art.querySelector<HTMLElement>('[data-testid="tweetText"]')
    if (el?.innerText.startsWith(head) && !art.querySelector('[data-testid="tweet-text-show-more-link"]')) return el.innerText
  }
  return ''
}

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
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** 帖子时间按 +08:00 显示 */
export const fmtTime = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')

/** Telegram HTML 格式消息；limit 是正文最大字数（sendPhoto 的 caption 只有 1024） */
export function formatMessage(p: Post, source: Source, limit = 3500): string {
  const kind = source === 'replies' ? (p.replyTo ? `回复 @${esc(p.replyTo)}` : '回复') : '发帖'
  const media = [p.photos.length ? `${p.photos.length} 张图` : '', p.hasVideo ? '视频' : ''].filter(Boolean).join(' + ')
  const lines = [`<b>@${esc(p.handle)}</b> · ${kind} · ${fmtTime(p.date)}`, '']
  if (p.text) lines.push(esc(cut(p.text, limit)))
  if (p.quote) lines.push('', `<blockquote>${esc(cut(p.quote, Math.min(600, limit / 2)))}</blockquote>`)
  const tail = [media && `[${media}]`, p.truncated ? '[长帖，正文不全]' : ''].filter(Boolean).join(' ')
  lines.push('', `${tail ? `${tail} ` : ''}<a href="https://x.com/${esc(p.handle)}/status/${p.id}">查看原帖</a>`)
  return lines.join('\n')
}

/** X 图片地址换成大图 */
export const largePhoto = (src: string) => (/[?&]name=/.test(src) ? src.replace(/([?&]name=)\w+/, '$1large') : src)
