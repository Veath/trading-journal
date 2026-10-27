import { noteAssetUrl, notes } from '../lib/load'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'

const REPO_URL = 'https://github.com/Veath/trading-journal/blob/main'

const CATEGORY_LABELS: Record<string, string> = {
  ict: 'ICT',
  psychology: '交易心理 & 日志',
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
  const order = Object.keys(CATEGORY_LABELS)
  const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length)
  const categories = [...new Set(notes.map((n) => n.category))].sort((a, b) => rank(a) - rank(b))
  if (!current) return <div className="empty card">notes/ 目录下还没有笔记</div>

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
      <aside className="card">
        {categories.map((c) => (
          <div key={c}>
            <div className="nav-cat">{CATEGORY_LABELS[c] ?? c}</div>
            {notes
              .filter((n) => n.category === c)
              .map((n) => (
                <a key={n.path} href={href('notes', ...n.path.split('/'))} className={n === current ? 'active' : ''}>
                  {n.title}
                </a>
              ))}
          </div>
        ))}
      </aside>
      <article className="card" onClick={onClick}>
        <Markdown source={current.body} resolveImage={(src) => {
          const path = resolveRepoPath(current.path, src)
          return path ? noteAssetUrl(path) : undefined
        }} />
      </article>
    </div>
  )
}
