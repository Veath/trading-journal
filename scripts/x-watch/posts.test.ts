import { describe, expect, it } from 'vitest'
import { challengeBackoff, formatMessage, nextDelay, largePhoto, markSeen, pickNew, type Post, type State } from './posts.ts'

const NOW = Date.parse('2026-11-04T10:00:00Z')
const post = (id: string, date: string, extra: Partial<Post> = {}): Post => ({
  id,
  handle: 'Keyshotvv',
  date,
  text: `text ${id}`,
  quote: '',
  replyTo: '',
  parent: null,
  card: '',
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
  it('回复：标题带对象，原文放引用块，转义 HTML', () => {
    const msg = formatMessage(
      post('9', '2026-11-04T09:00:00Z', { text: 'a < b & c', parent: { handle: 'fred', text: 'parent\n\n\n\ntext' } }),
    )
    expect(msg).toContain('💬 <a href="https://x.com/Keyshotvv"><b>Keyshotvv</b></a> 回复 @fred  ·  <i>11-04 17:00</i>')
    expect(msg).toContain('<blockquote>parent\n\ntext</blockquote>')
    expect(msg).toContain('a &lt; b &amp; c')
    expect(msg.indexOf('blockquote')).toBeLessThan(msg.indexOf('a &lt; b'))
    expect(msg).toContain('<a href="https://x.com/Keyshotvv/status/9">查看原帖 ↗</a>')
  })

  it('没有回复对象的算发帖', () => {
    expect(formatMessage(post('9', '2026-11-04T09:00:00Z'))).toContain('📝')
  })

  it('回复自己算续帖，不重复显示上文', () => {
    const msg = formatMessage(post('9', '2026-11-04T09:00:00Z', { parent: { handle: 'keyshotvv', text: 'x' } }))
    expect(msg).toContain('🧵')
    expect(msg).not.toContain('blockquote')
  })

  it('没有正文时显示链接卡片 / 无文字', () => {
    expect(formatMessage(post('9', '2026-11-04T09:00:00Z', { text: '', card: 'Fund Your Edge' }))).toContain('🔗 Fund Your Edge')
    expect(formatMessage(post('9', '2026-11-04T09:00:00Z', { text: '' }))).toContain('（无文字）')
  })

  it('按 limit 截断正文，标注长帖和多图', () => {
    const msg = formatMessage(post('9', '2026-11-04T09:00:00Z', { text: 'x'.repeat(50), truncated: true, photos: ['a', 'b'] }), 10)
    expect(msg).toContain(`${'x'.repeat(10)}…`)
    expect(msg).toContain('📝')
    expect(msg).toContain('共 2 张图')
    expect(msg).toContain('长帖')
  })
})

it('challengeBackoff', () => {
  expect([1, 2, 3, 4].map((n) => challengeBackoff(n) / 60_000)).toEqual([30, 60, 120, 120])
})

it('nextDelay：平时在 60%～140% 之间，偶尔 2～3 倍', () => {
  const seq = (...v: number[]) => () => v.shift()!
  expect(nextDelay(100, seq(0.5, 0))).toBe(60)
  expect(nextDelay(100, seq(0.5, 0.999))).toBe(140)
  expect(nextDelay(100, seq(0.05, 0.5))).toBe(250)
  for (let i = 0; i < 1000; i++) {
    const d = nextDelay(100)
    expect(d >= 60 && d <= 300).toBe(true)
  }
})

it('largePhoto', () => {
  expect(largePhoto('https://pbs.twimg.com/media/a?format=jpg&name=small')).toBe('https://pbs.twimg.com/media/a?format=jpg&name=large')
})
