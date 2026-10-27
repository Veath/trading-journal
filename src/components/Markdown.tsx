import { useMemo } from 'react'
import { marked } from 'marked'

/** 渲染本地 Markdown（内容来自仓库自身文件） */
interface Props {
  source: string
  /** 把图片的相对 src 解析成可访问的 URL；返回 undefined 时保持原样 */
  resolveImage?: (src: string) => string | undefined
}

export default function Markdown({ source, resolveImage }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false })
    if (!resolveImage) return raw
    return raw.replace(/<img src="([^"]+)"/g, (m, src: string) => {
      const url = resolveImage(src)
      return url ? `<img src="${url}"` : m
    })
  }, [source, resolveImage])
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
