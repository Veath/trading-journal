import { useEffect, useState } from 'react'
import { noteAssetUrl, notes, type Note } from '../lib/load'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'
import { handleRepoLinkClick, resolveRepoPath } from '../lib/links'

const CATEGORY_LABELS: Record<string, string> = {
  ict: 'ICT',
  psychology: '交易心理 & 日志',
  mentors: '导师',
  'natural-trading-theory': '自然交易理论',
  rsi: 'RSI',
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

  const notePath = `notes/${current.path}`

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
      <article className="card note-body" onClick={(e) => handleRepoLinkClick(e, notePath)}>
        <Markdown source={current.body} resolveImage={(src) => {
          const path = resolveRepoPath(notePath, src)
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
