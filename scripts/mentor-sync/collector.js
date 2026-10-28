// X 时间线采集器：在已登录的浏览器中分别打开 https://x.com/__HANDLE__ （帖子）和
// https://x.com/__HANDLE__/with_replies （回复），把整段脚本粘贴到开发者工具控制台运行。
// 两个页面的内容不重叠：「回复」页只有回复，原创推文只在「帖子」页。
// 由 `pnpm mentor:collect` 生成，请勿直接修改占位符。
(async () => {
  const HANDLE = '__HANDLE__'
  const SINCE = '__SINCE__' // 只收集该时间（ISO）之后的内容
  const DOWNLOAD = __DOWNLOAD__
  const SOURCE = /\/with_replies\/?$/.test(location.pathname) ? 'replies' : 'posts'
  const MAX_IDLE = 12 // 连续多少轮没有新增范围内内容就停止（时间线不严格按时间排序）
  const posts = {}

  const collect = () => {
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      const timeEl = art.querySelector('time')
      const link = timeEl?.closest('a')?.getAttribute('href') ?? ''
      const m = link.match(/^\/([^/]+)\/status\/(\d+)/)
      if (!m || m[1].toLowerCase() !== HANDLE.toLowerCase()) continue
      const date = timeEl.getAttribute('datetime')
      if (date <= SINCE) continue
      const ctx = art.querySelector('[data-testid="socialContext"]')?.innerText ?? ''
      if (/pinned|置顶/i.test(ctx)) continue
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
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // 页面之前滚动过时高度不会再增长，只有到底了高度还不变才算加载不出新内容
  const atBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 200

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

  // 长帖在时间线上只显示前半段：站内跳到原帖页读全文，再回到时间线。
  // 原帖页的时间链接格式不固定，用开头文字匹配；时间线上那条带「显示更多」，不会被误认
  const go = (path) => {
    history.pushState({}, '', path)
    dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  }
  const startPath = location.pathname
  const truncatedPosts = Object.values(posts).filter((p) => p.truncated && p.text)
  for (const [i, p] of truncatedPosts.entries()) {
    go(`/${HANDLE}/status/${p.id}`)
    const head = p.text.slice(0, 20)
    for (let t = 0; t < 20; t++) {
      await sleep(500)
      const art = [...document.querySelectorAll('article[data-testid="tweet"]')].find((a) =>
        (a.querySelector('[data-testid="tweetText"]')?.innerText ?? '').startsWith(head),
      )
      if (!art || art.querySelector('[data-testid="tweet-text-show-more-link"]')) continue
      const text = art.querySelector('[data-testid="tweetText"]').innerText
      if (text.length > p.text.length) Object.assign(p, { text, truncated: false })
      break
    }
    console.log(`[mentor-sync] 补全长帖 ${i + 1}/${truncatedPosts.length}${p.truncated ? '（失败）' : ''}`)
  }
  if (truncatedPosts.length) go(startPath)

  const result = {
    handle: HANDLE,
    source: SOURCE,
    since: SINCE,
    collectedAt: new Date().toISOString(),
    posts: Object.values(posts).sort((a, b) => a.date.localeCompare(b.date)),
  }
  window.__mentorSync = result
  const truncated = result.posts.filter((p) => p.truncated).length
  console.log(`[mentor-sync] 完成（${SOURCE}）：${result.posts.length} 条新内容` + (truncated ? `，${truncated} 条长帖未能补全，需要手动打开原帖` : ''))
  if (DOWNLOAD && result.posts.length) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    a.download = `${HANDLE.toLowerCase()}-${SOURCE}-${result.collectedAt.slice(0, 10)}.json`
    a.click()
  }
  return result.posts.length
})()
