import { describe, expect, it } from 'vitest'
import { formatMessage, largePhoto, markSeen, pickNew, type Post, type State } from './posts.ts'

const NOW = Date.parse('2026-11-04T10:00:00Z')
const post = (id: string, date: string, extra: Partial<Post> = {}): Post => ({
  id,
  handle: 'Keyshotvv',
  date,
  text: `text ${id}`,
  quote: '',
  replyTo: '',
  photos: [],
  hasVideo: false,
  truncated: false,
  ...extra,
})

describe('pickNew', () => {
  it('未初始化的 key 不推送', () => {
    expect(pickNew({}, 'k', [post('1', '2026-11-04T09:00:00Z')], NOW)).toEqual([])
  })

  it('只返回没见过的、24 小时内的帖子，按时间升序、去重', () => {
    const state: State = { k: ['1'] }
    const items = [
      post('3', '2026-11-04T09:30:00Z'),
      post('1', '2026-11-04T09:00:00Z'),
      post('2', '2026-11-04T09:10:00Z'),
      post('2', '2026-11-04T09:10:00Z'),
      post('0', '2026-11-02T09:00:00Z'), // 太旧（比如置顶）
    ]
    expect(pickNew(state, 'k', items, NOW).map((p) => p.id)).toEqual(['2', '3'])
  })
})

describe('markSeen', () => {
  it('追加、不重复、保留最近 300 条', () => {
    const state: State = { k: Array.from({ length: 300 }, (_, i) => String(i)) }
    markSeen(state, 'k', ['5', 'new'])
    expect(state.k).toHaveLength(300)
    expect(state.k.at(-1)).toBe('new')
    expect(state.k[0]).toBe('1')
  })
})

describe('formatMessage', () => {
  it('转义 HTML，标注类型、媒体和链接', () => {
    const msg = formatMessage(
      post('9', '2026-11-04T09:00:00Z', { text: 'a < b & c', replyTo: 'fred', photos: ['x'], truncated: true }),
      'replies',
    )
    expect(msg).toContain('<b>@Keyshotvv</b> · 回复 @fred · 11-04 17:00')
    expect(msg).toContain('a &lt; b &amp; c')
    expect(msg).toContain('[1 张图] [长帖，正文不全] <a href="https://x.com/Keyshotvv/status/9">查看原帖</a>')
  })

  it('按 limit 截断正文', () => {
    const msg = formatMessage(post('9', '2026-11-04T09:00:00Z', { text: 'x'.repeat(50) }), 'posts', 10)
    expect(msg).toContain(`${'x'.repeat(10)}…`)
    expect(msg).toContain('· 发帖 ·')
  })
})

it('largePhoto', () => {
  expect(largePhoto('https://pbs.twimg.com/media/a?format=jpg&name=small')).toBe('https://pbs.twimg.com/media/a?format=jpg&name=large')
})
