import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'

/** 渲染本地 Markdown（内容来自仓库自身文件） */
interface Props {
  source: string
  /** 把图片的相对 src 解析成可访问的 URL；返回 undefined 时保持原样 */
  resolveImage?: (src: string) => string | undefined
  /** 用 React 组件替换图片（如示意图的交互版）；返回 undefined 时按普通图片处理 */
  embedImage?: (src: string) => ReactNode | undefined
}

export default function Markdown({ source, resolveImage, embedImage }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { html, embeds } = useMemo(() => {
    const embeds: ReactNode[] = []
    let raw = marked.parse(source, { async: false })
    // 被替换的图片单独成段时，连同 <p> 一起替换，避免 <div> 嵌在 <p> 里
    raw = raw.replace(/(<p>)?<img src="([^"]+)"[^>]*>(<\/p>)?/g, (m, open: string | undefined, src: string, close: string | undefined) => {
      const node = embedImage?.(src)
      if (node !== undefined) {
        embeds.push(node)
        const slot = `<div class="md-embed" data-embed="${embeds.length - 1}"></div>`
        return open && close ? slot : `${open ?? ''}${slot}${close ?? ''}`
      }
      const url = resolveImage?.(src)
      return url ? m.replace(`<img src="${src}"`, `<img src="${url}"`) : m
    })
    return { html: raw, embeds }
  }, [source, resolveImage, embedImage])

  const [slots, setSlots] = useState<HTMLElement[]>([])
  useLayoutEffect(() => {
    setSlots(embeds.length ? [...ref.current!.querySelectorAll<HTMLElement>('[data-embed]')] : [])
  }, [html, embeds])

  return (
    <>
      <div ref={ref} className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
      {slots.map((el) => {
        const node = embeds[Number(el.dataset.embed)]
        return node === undefined ? null : createPortal(node, el, el.dataset.embed)
      })}
    </>
  )
}
