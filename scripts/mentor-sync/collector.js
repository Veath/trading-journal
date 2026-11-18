// X 时间线采集器：在已登录的浏览器中分别打开 https://x.com/__HANDLE__ （帖子）和
// https://x.com/__HANDLE__/with_replies （回复），把整段脚本粘贴到开发者工具控制台运行。
// 两个页面的内容不重叠：「回复」页只有回复，原创推文只在「帖子」页。
// 「回复」页会同时记下他回复的那条推文（replyTo：提问者、文字、链接），时间线上没显示的到原帖页补。
// 补采模式（`pnpm mentor:collect --questions ...` 生成，BACKFILL 非空）：不滚动时间线，只逐条打开原帖补 replyTo。
// 由 `pnpm mentor:collect` 生成，请勿直接修改占位符。
(async () => {
  const HANDLE = '__HANDLE__'
  const SINCE = '__SINCE__' // 只收集该时间（ISO）之后的内容
  const DOWNLOAD = __DOWNLOAD__
  const BACKFILL = __BACKFILL__ // [{ id, head }]：需要补 replyTo 的已有回复
  const SOURCE = BACKFILL.length ? 'questions' : /\/with_replies\/?$/.test(location.pathname) ? 'replies' : 'posts'
  const MAX_IDLE = 12 // 连续多少轮没有新增范围内内容就停止（时间线不严格按时间排序）
  const posts = {}

  const statusOf = (art) => {
    const href = art.querySelector('time')?.closest('a')?.getAttribute('href') ?? ''
    return href.match(/^\/([^/]+)\/status\/(\d+)/)
  }
  const authorOf = (art) => (art.querySelector('[data-testid="User-Name"] a')?.getAttribute('href') ?? '').slice(1)
  const textOf = (art) => art.querySelector('[data-testid="tweetText"]')?.innerText ?? ''
  // 对话串里，被回复的推文在紧挨着的上一个 cell；中间隔了分隔 cell 就说明上面没有显示被回复的推文
  const parentOf = (art) => {
    const prev = art.closest('[data-testid="cellInnerDiv"]')?.previousElementSibling
    const pa = prev?.querySelector('article[data-testid="tweet"]')
    const m = pa && statusOf(pa)
    if (!m) return null
    return {
      handle: m[1],
      text: textOf(pa),
      hasMedia: !!pa.querySelector('[data-testid="tweetPhoto"], video'),
      url: `https://x.com/${m[1]}/status/${m[2]}`,
    }
  }

  const collect = () => {
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      const m = statusOf(art)
      if (!m || m[1].toLowerCase() !== HANDLE.toLowerCase()) continue
      const date = art.querySelector('time').getAttribute('datetime')
      if (date <= SINCE) continue
      const ctx = art.querySelector('[data-testid="socialContext"]')?.innerText ?? ''
      if (/pinned|置顶/i.test(ctx)) continue
      const old = posts[m[2]]
      posts[m[2]] = {
        id: m[2],
        date,
        text: art.querySelector('[data-testid="tweetText"]')?.innerText ?? '',
        hasMedia: !!art.querySelector('[data-testid="tweetPhoto"], video'),
        // 长帖在时间线上只显示前半段，需要打开原帖补全
        truncated: !!art.querySelector('[data-testid="tweet-text-show-more-link"]'),
        source: SOURCE,
        url: `https://x.com/${HANDLE}/status/${m[2]}`,
      }
      if (SOURCE === 'replies') posts[m[2]].replyTo = parentOf(art) ?? old?.replyTo ?? null
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // 页面之前滚动过时高度不会再增长，只有到底了高度还不变才算加载不出新内容
  const atBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 200

  if (!BACKFILL.length) {
    window.scrollTo(0, 0)
    let idle = 0
    let lastCount = 0
    let lastHeight = 0
    let stuck = 0
    while (idle < MAX_IDLE && stuck < 6) {
      collect()
      window.scrollBy(0, 2500)
      await sleep(1800)
      const count = Object.keys(posts).length
      idle = count === lastCount ? idle + 1 : 0
      stuck = atBottom() && document.body.scrollHeight === lastHeight ? stuck + 1 : 0
      lastCount = count
      lastHeight = document.body.scrollHeight
      console.log(`[mentor-sync] 已收集 ${count} 条`)
    }
    collect()
  } else {
    for (const { id, head } of BACKFILL) posts[id] = { id, head, replyTo: null, needsParent: true }
  }

  // 站内跳到原帖页（不刷新页面，脚本继续运行）：补全长帖的全文、补回复的 replyTo，最后回到时间线。
  // 原帖页的时间链接格式不固定，按作者 + 开头文字找到他那条；时间线上那条带「显示更多」，不会被误认
  const go = (path) => {
    history.pushState({}, '', path)
    dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  }
  const startPath = location.pathname
  for (const p of Object.values(posts)) {
    if (SOURCE === 'replies' && !p.replyTo && p.text) p.needsParent = true
  }
  const pending = Object.values(posts).filter((p) => (p.truncated && p.text) || p.needsParent)
  for (const [i, p] of pending.entries()) {
    go(`/${HANDLE}/status/${p.id}`)
    const head = (p.head ?? p.text).slice(0, 20)
    for (let t = 0; t < 20; t++) {
      await sleep(500)
      const art = [...document.querySelectorAll('article[data-testid="tweet"]')].find(
        (a) => authorOf(a).toLowerCase() === HANDLE.toLowerCase() && textOf(a).startsWith(head),
      )
      if (!art || art.querySelector('[data-testid="tweet-text-show-more-link"]')) continue
      if (p.truncated) {
        const text = textOf(art)
        if (text.length > p.text.length) Object.assign(p, { text, truncated: false })
      }
      if (p.needsParent) {
        await sleep(500) // 等上方的对话串渲染完
        p.replyTo = parentOf(art)
      }
      break
    }
    delete p.needsParent
    console.log(`[mentor-sync] 打开原帖 ${i + 1}/${pending.length}${p.truncated ? '（长帖补全失败）' : ''}`)
  }
  if (pending.length) go(startPath)

  for (const p of Object.values(posts)) delete p.head
  const result = {
    handle: HANDLE,
    source: SOURCE,
    since: SINCE,
    collectedAt: new Date().toISOString(),
    posts: Object.values(posts)
      .filter((p) => SOURCE !== 'questions' || p.replyTo)
      .sort((a, b) => (a.date ?? a.id).localeCompare(b.date ?? b.id)),
  }
  window.__mentorSync = result
  const truncated = result.posts.filter((p) => p.truncated).length
  const noParent = SOURCE === 'replies' ? result.posts.filter((p) => !p.replyTo).length : 0
  console.log(
    `[mentor-sync] 完成（${SOURCE}）：${result.posts.length} 条` +
      (truncated ? `，${truncated} 条长帖未能补全，需要手动打开原帖` : '') +
      (noParent ? `，${noParent} 条回复没找到被回复的推文` : ''),
  )
  if (DOWNLOAD && result.posts.length) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    a.download = `${HANDLE.toLowerCase()}-${SOURCE}-${result.collectedAt.slice(0, 10)}.json`
    a.click()
  }
  return result.posts.length
})()
