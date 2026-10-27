import { notes } from '../lib/load'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'

export default function Notes({ path }: { path: string }) {
  const current = notes.find((n) => n.path === path) ?? notes[0]
  const categories = [...new Set(notes.map((n) => n.category))]
  if (!current) return <div className="empty card">notes/ 目录下还没有笔记</div>
  return (
    <div className="notes">
      <aside className="card">
        {categories.map((c) => (
          <div key={c}>
            <div className="nav-cat">{c}</div>
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
      <article className="card">
        <Markdown source={current.body} />
      </article>
    </div>
  )
}
