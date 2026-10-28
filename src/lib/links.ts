import { notes, trades } from './load'
import { href } from './router'

export const REPO_URL = 'https://github.com/Veath/trading-journal/blob/main'

/** 把 Markdown 里的相对链接解析成相对仓库根目录的路径；fromFile 为当前文件的仓库路径 */
export function resolveRepoPath(fromFile: string, link: string): string | null {
  const [target] = link.split('#')
  if (!target || target.startsWith('/') || /^[a-z]+:/i.test(target)) return null
  const parts = fromFile.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}

/** 点击处理：指向笔记、交易日志的链接在站内跳转，指向仓库其他文件的链接打开 GitHub */
export function handleRepoLinkClick(e: React.MouseEvent, fromFile: string): void {
  const a = (e.target as HTMLElement).closest('a')
  const target = a && resolveRepoPath(fromFile, a.getAttribute('href') ?? '')
  if (!target) return
  e.preventDefault()
  const note = target.replace(/^notes\//, '')
  const trade = /^journal\/trades\/(?:.+\/)?([^/]+)\.md$/.exec(target)
  if (target.startsWith('notes/') && notes.some((n) => n.path === note)) window.location.hash = href('notes', ...note.split('/'))
  else if (trade && trades.some((t) => t.id === trade[1])) window.location.hash = href('trades', trade[1])
  else window.open(`${REPO_URL}/${target}`, '_blank', 'noopener')
}
