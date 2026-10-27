import { useMemo } from 'react'
import { marked } from 'marked'

/** 渲染本地 Markdown（内容来自仓库自身文件） */
export default function Markdown({ source }: { source: string }) {
  const html = useMemo(() => marked.parse(source, { async: false }), [source])
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
