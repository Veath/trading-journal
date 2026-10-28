import { useEffect, useState } from 'react'
import { noteAssetUrl, notes, type Note } from '../lib/load'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'

const REPO_URL = 'https://github.com/Veath/trading-journal/blob/main'

const CATEGORY_LABELS: Record<string, string> = {
  ict: 'ICT',
  psychology: '交易心理 & 日志',
  mentors: '导师',
  'natural-trading-theory': '自然交易理论',
  rsi: 'RSI',
}

/** 把笔记里的相对链接（如 ./02-liquidity.md、../../docs/STATS.md）解析成相对仓库根目录的路径 */
function resolveRepoPath(fromNote: string, link: string): string | null {
  const [target] = link.split('#')
  if (!target || target.startsWith('/') || /^[a-z]+:/i.test(target)) return null
  const parts = `notes/${fromNote}`.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

export default function Notes({ path }: { path: string }) {
  const current = notes.find((n) => n.path === path) ?? notes[0]
  const [drawerOpen, setDrawerOpen] = useState(false)
  const order = Object.keys(CATEGORY_LABELS)
  const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length)
  const categories = [...new Set(notes.map((n) => n.category))].sort((a, b) => rank(a) - rank(b))
  // 按侧边栏的显示顺序排列，用于上一篇 / 下一篇
  const ordered: Note[] = categories.flatMap((c) => notes.filter((n) => n.category === c))
  const index = current ? ordered.indexOf(current) : -1
  const prev = ordered[index - 1]
  const next = ordered[index + 1]

  useEffect(() => setDrawerOpen(false), [path])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  if (!current) return <div className="empty card">notes/ 目录下还没有笔记</div>
  const noteHref = (n: Note) => href('notes', ...n.path.split('/'))

  // 指向其他笔记的链接在站内跳转；指向仓库其他文件（模板、文档）的链接打开 GitHub
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const target = a && resolveRepoPath(current.path, a.getAttribute('href') ?? '')
    if (!target) return
    e.preventDefault()
    const note = target.replace(/^notes\//, '')
    if (notes.some((n) => n.path === note)) window.location.hash = href('notes', ...note.split('/'))
    else window.open(`${REPO_URL}/${target}`, '_blank', 'noopener')
  }

  return (
    <div className="notes">
      <button type="button" className="toc-toggle" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        目录
        <span className="muted">{CATEGORY_LABELS[current.category] ?? current.category} / {current.title}</span>
      </button>
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
      <aside className={`card toc ${drawerOpen ? 'open' : ''}`} aria-label="笔记目录">
        {categories.map((c) => (
          <div key={c}>
            <div className="nav-cat">{CATEGORY_LABELS[c] ?? c}</div>
            {notes
              .filter((n) => n.category === c)
              .map((n) => (
                <a key={n.path} href={noteHref(n)} className={n === current ? 'active' : ''} aria-current={n === current ? 'page' : undefined}>
                  {n.title}
                </a>
              ))}
          </div>
        ))}
      </aside>
      <article className="card note-body" onClick={onClick}>
        <Markdown source={current.body} resolveImage={(src) => {
          const path = resolveRepoPath(current.path, src)
          return path ? noteAssetUrl(path) : undefined
        }} />
        <nav className="note-pager" aria-label="翻页">
          {prev ? (
            <a href={noteHref(prev)}>
              <span className="muted">上一篇</span>
              {prev.title}
            </a>
          ) : <span />}
          {next && (
            <a href={noteHref(next)} className="next">
              <span className="muted">下一篇</span>
              {next.title}
            </a>
          )}
        </nav>
      </article>
    </div>
  )
}
