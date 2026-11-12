import { afterEach, describe, expect, it, vi } from 'vitest'
import { challengeBackoff, formatMessage, isPromotion, nextDelay, largePhoto, markSeen, pageStatus, pickNew, restoreOriginalText, type Post, type State } from './posts.ts'

const NOW = Date.parse('2026-11-04T10:00:00Z')
const post = (id: string, date: string, extra: Partial<Post> = {}): Post => ({
  id,
  handle: 'Keyshotvv',
  name: '',
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

describe('restoreOriginalText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('没有自动译文时直接采集，不触发翻译', async () => {
    const translate = { getAttribute: () => 'Translate post', click: vi.fn() }
    vi.stubGlobal('document', { querySelectorAll: () => [translate] })

    expect(await restoreOriginalText()).toBe(true)
    expect(translate.click).not.toHaveBeenCalled()
  })

  it.each(['Show original', '显示原文', '顯示原文'])('采集前通过「%s」切回原文', async (label) => {
    vi.useFakeTimers()
    let translated = true
    const original = { getAttribute: () => label, click: vi.fn(() => { translated = false }) }
    const like = { getAttribute: () => 'Like', click: vi.fn() }
    vi.stubGlobal('document', { querySelectorAll: () => translated ? [original, like] : [like] })

    const restored = restoreOriginalText()
    await vi.runAllTimersAsync()

    expect(await restored).toBe(true)
    expect(original.click).toHaveBeenCalledOnce()
    expect(like.click).not.toHaveBeenCalled()
  })

  it('切回原文超时则返回失败，阻止推送译文', async () => {
    vi.useFakeTimers()
    const original = { getAttribute: () => 'Show original', click: vi.fn() }
    vi.stubGlobal('document', { querySelectorAll: () => [original] })

    const restored = restoreOriginalText()
    await vi.runAllTimersAsync()

    expect(await restored).toBe(false)
  })
})

describe('pageStatus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    { name: '识别目标账号的受保护提示', handle: 'lucretiandelta', hasHelpLink: true, expected: true },
    { name: '切换账号时忽略上一页的受保护提示', handle: 'Keyshotvv', hasHelpLink: true, expected: false },
    { name: '普通空页面不算受保护', handle: 'LucretianDelta', hasHelpLink: false, expected: false },
  ])('$name', ({ handle, hasHelpLink, expected }) => {
    const notice = {
      textContent: hasHelpLink
        ? '只有获批准的关注者可以查看 @LucretianDelta 的帖子。'
        : '当 @LucretianDelta 发帖时，你会在这里看到。',
      querySelector: (selector: string) => (hasHelpLink && selector === 'a[href$="/articles/14016"]' ? {} : null),
    }
    vi.stubGlobal('document', {
      querySelector: (selector: string) => {
        if (selector === '#react-root') return {}
        if (selector === '[data-testid="primaryColumn"] [data-testid="empty_state_body_text"]') return notice
        return null
      },
      querySelectorAll: () => [],
    })

    expect(pageStatus(handle).protected).toBe(expected)
  })
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

describe('isPromotion', () => {
  it.each([
    { name: '优惠码', text: '50K instant accounts with code FRED.' },
    { name: '带标点的优惠码', text: 'Use code: "FRED" at checkout.' },
    { name: '其他优惠码', text: 'Discount code: SAVE20 for evaluations.' },
    { name: '用本人优惠码参加赠奖', text: 'Send proof of using my code to join the giveaway.' },
    { name: 'FYE 返佣链接', text: 'https://fundyouredge.com/?ref=FRED' },
    { name: 'Lucid 返佣链接', text: 'https://lucidtrading.com/ref/fred' },
    { name: 'Vest 活动推广链接', text: 'Join the challenge: https://next.vestmarkets.com/r/vnfred' },
    { name: '限时折扣', text: 'Lucid evaluations are 60% OFF today.' },
    { name: 'BOGO 活动', text: 'FundYourEdge has a BOGO sale on evaluations.' },
    { name: '链接卡片里的购买引导', text: 'Check out Alpha here.', card: 'Simulated funded accounts up to $4M.' },
  ])('过滤 $name', ({ text, card }) => {
    expect(isPromotion(post('ad', '2026-11-04T09:00:00Z', { handle: 'fredtradesnq', text, card: card ?? '' }))).toBe(true)
  })

  it.each([
    'Which prop firm do you use? Lucid, Tradeify, MFFU, FYE or Vest?',
    'My indicator caught the FVG after CPI.',
    'NQ reached discount and swept sell-side liquidity.',
    'Took 50% off my NQ position at TP1.',
    'Trading my Lucid account, took 50% off at TP1.',
    'Check out this FVG on my Lucid account. Buy at discount.',
    'Lucid payouts have been faster in my experience.',
    'Chart reference: https://reddit.com/r/fred',
  ])('保留普通讨论和交易内容 %s', (text) => {
    expect(isPromotion(post('trade', '2026-11-04T09:00:00Z', { handle: 'fredtradesnq', text }))).toBe(false)
  })

  it.each(['FJTrades', 'FredTrades'])('识别改名前的账号及大小写 %s', (handle) => {
    expect(isPromotion(post('ad', '2026-11-04T09:00:00Z', { handle, text: 'Use code FRED.' }))).toBe(true)
  })

  it('只过滤 Fred 的推广', () => {
    expect(isPromotion(post('ad', '2026-11-04T09:00:00Z', { text: 'Use code FRED.' }))).toBe(false)
  })

  it('过滤本人广告对话串的续帖', () => {
    expect(isPromotion(post('reply', '2026-11-04T09:00:00Z', {
      handle: 'fredtradesnq',
      text: 'Details here.',
      parent: { handle: 'FredTradesNQ', name: 'Fred', text: 'Evaluations with code FRED.' },
    }))).toBe(true)
  })

  it('只凭他人的广告或引用内容不判为本人推广', () => {
    expect(isPromotion(post('reply', '2026-11-04T09:00:00Z', {
      handle: 'fredtradesnq',
      text: 'These promises look misleading.',
      parent: { handle: 'someone', name: '', text: 'Use code FRED.' },
      quote: 'Use code FRED.',
    }))).toBe(false)
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
      post('9', '2026-11-04T09:00:00Z', { text: 'a < b & c', parent: { handle: 'fred', name: '', text: 'parent\n\n\n\ntext' } }),
    )
    expect(msg).toContain('💬 <a href="https://x.com/Keyshotvv"><b>Keyshotvv</b></a> 回复 @fred  ·  <i>11-04 17:00</i>')
    expect(msg).toContain('<blockquote>parent\n\ntext</blockquote>')
    expect(msg).toContain('a &lt; b &amp; c')
    expect(msg.indexOf('blockquote')).toBeLessThan(msg.indexOf('a &lt; b'))
    expect(msg).toContain('<a href="https://x.com/Keyshotvv/status/9">查看原帖 ↗</a>')
  })

  it('有昵称时标题显示「昵称 @账号」，回复对象也带昵称', () => {
    const msg = formatMessage(
      post('9', '2026-11-04T09:00:00Z', { name: 'Key <shot>', parent: { handle: 'fredtrades', name: 'Fred 💚', text: 'hi' } }),
    )
    expect(msg).toContain('💬 <a href="https://x.com/Keyshotvv"><b>Key &lt;shot&gt;</b></a> @Keyshotvv 回复 Fred 💚 @fredtrades')
  })

  it('没有回复对象的算发帖', () => {
    expect(formatMessage(post('9', '2026-11-04T09:00:00Z'))).toContain('📝')
  })

  it('回复自己算续帖，不重复显示上文', () => {
    const msg = formatMessage(post('9', '2026-11-04T09:00:00Z', { parent: { handle: 'keyshotvv', name: '', text: 'x' } }))
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
