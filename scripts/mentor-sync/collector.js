// X 时间线采集器：在已登录的浏览器中打开 https://x.com/__HANDLE__/with_replies ，
// 把整段脚本粘贴到开发者工具控制台运行。由 `pnpm mentor:collect` 生成，请勿直接修改占位符。
(async () => {
  const HANDLE = '__HANDLE__'
  const SINCE = '__SINCE__' // 只收集该时间（ISO）之后的内容
  const DOWNLOAD = __DOWNLOAD__
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
        url: `https://x.com/${HANDLE}/status/${m[2]}`,
      }
    }
  }

  let idle = 0
  let lastCount = 0
  let lastHeight = 0
  let stuck = 0
  while (idle < MAX_IDLE && stuck < 6) {
    collect()
    window.scrollBy(0, 2500)
    await new Promise((r) => setTimeout(r, 1800))
    const count = Object.keys(posts).length
    idle = count === lastCount ? idle + 1 : 0
    stuck = document.body.scrollHeight === lastHeight ? stuck + 1 : 0
    lastCount = count
    lastHeight = document.body.scrollHeight
    console.log(`[mentor-sync] 已收集 ${count} 条`)
  }
  collect()

  const result = {
    handle: HANDLE,
    since: SINCE,
    collectedAt: new Date().toISOString(),
    posts: Object.values(posts).sort((a, b) => a.date.localeCompare(b.date)),
  }
  window.__mentorSync = result
  console.log(`[mentor-sync] 完成：${result.posts.length} 条新内容`)
  if (DOWNLOAD && result.posts.length) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    a.download = `${HANDLE.toLowerCase()}-${result.collectedAt.slice(0, 10)}.json`
    a.click()
  }
  return result.posts.length
})()
