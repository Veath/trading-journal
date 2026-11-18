import { describe, expect, it } from 'vitest'
import { needsReplyTo, type Post } from './store.ts'

const reply = (over: Partial<Post> = {}): Post => ({
  id: '1',
  date: '2026-11-14T03:00:00.000Z',
  text: '流动性进场流动性出场',
  hasMedia: false,
  source: 'replies',
  url: 'https://x.com/Keyshotvv/status/1',
  ...over,
})

describe('needsReplyTo', () => {
  const from = '2026-11-13T00:00:00.000Z'
  const to = '2026-11-16T00:00:00.000Z'

  it('范围内、还没查过的回复需要补', () => {
    expect(needsReplyTo(reply(), from, to)).toBe(true)
  })

  it('查过的不再补：找到的和没找到（null）都算查过', () => {
    expect(needsReplyTo(reply({ replyTo: { handle: 'a', text: '问', hasMedia: false, url: 'u' } }), from, to)).toBe(false)
    expect(needsReplyTo(reply({ replyTo: null }), from, to)).toBe(false)
  })

  it('原创推文、没有文字的回复、范围外的都跳过', () => {
    expect(needsReplyTo(reply({ source: 'posts' }), from, to)).toBe(false)
    expect(needsReplyTo(reply({ text: '' }), from, to)).toBe(false)
    expect(needsReplyTo(reply({ date: '2026-11-12T23:59:59.000Z' }), from, to)).toBe(false)
    expect(needsReplyTo(reply({ date: to }), from, to)).toBe(false)
  })
})
