import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawn, openBrowser, closeBrowser, execFileSync } = vi.hoisted(() => ({
  spawn: vi.fn(),
  openBrowser: vi.fn(),
  closeBrowser: vi.fn(),
  execFileSync: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawn, execFileSync }))
vi.mock('node:fs', () => ({
  existsSync: (path: string) => path.endsWith('/Default/Cookies'),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}))
vi.mock('./cdp.ts', () => ({ CHROME: 'Chrome', openBrowser, closeBrowser }))
vi.mock('./watchlist.ts', () => ({ HANDLES: ['Keyshotvv'] }))

describe('x-watch', () => {
  let chrome: EventEmitter & { exitCode: number | null; kill: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.stubEnv('TG_BOT_TOKEN', 'test-token')
    vi.stubEnv('TG_CHAT_ID', 'test-chat')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    chrome = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      kill: vi.fn(() => { setTimeout(() => chrome.emit('exit', null, 'SIGTERM'), 0) }),
    })
    spawn.mockReturnValue(chrome)
    execFileSync.mockReturnValue('1')
    openBrowser.mockImplementation(async () => ({
      closed: false,
      send: vi.fn(async (method: string) => method === 'Network.getCookies' ? { cookies: [{ name: 'auth_token' }] } : {}),
      evaluate: vi.fn(async (fn: Function) =>
        fn.name === 'pageStatus' ? { challenge: true, fresh: 0, protected: false } : false),
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('验证 Cookie 更新后仍保持窗口打开，等待用户退出', async () => {
    await import('./watch.ts')
    await vi.advanceTimersByTimeAsync(1000)
    expect(spawn).toHaveBeenCalledOnce()

    execFileSync.mockReturnValue('2')
    await vi.advanceTimersByTimeAsync(10_000)

    expect(chrome.kill).not.toHaveBeenCalled()
    expect(openBrowser).toHaveBeenCalledOnce()
  })

  it('用户退出验证窗口后恢复监控，再遇验证时等待退避', async () => {
    await import('./watch.ts')
    await vi.advanceTimersByTimeAsync(1000)
    chrome.exitCode = 0
    chrome.emit('exit', 0, null)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(openBrowser).toHaveBeenCalledTimes(2)
    expect(spawn).toHaveBeenCalledOnce()
  })

  function healthyTimeline() {
    const visit = vi.fn()
    const navigate = vi.fn()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    openBrowser.mockResolvedValue({
      closed: false,
      send: async (method: string, params: { url: string }) => {
        if (method === 'Network.getCookies') return { cookies: [{ name: 'auth_token' }] }
        if (method === 'Page.navigate') navigate(params.url)
        return {}
      },
      evaluate: async (fn: Function, arg: unknown) => {
        if (fn.name === 'pageStatus') return { challenge: false, fresh: 1, protected: false }
        if (fn.name === 'restoreOriginalText') return true
        if (fn.name === 'extractTimeline') return []
        if (arg && typeof arg === 'object' && 'path' in arg && 'hard' in arg) {
          visit(arg.path)
          return !arg.hard
        }
        throw new Error(`未预期的页面操作：${fn.name}`)
      },
    })
    return { visit, navigate }
  }

  it('默认两轮相隔 10 分钟，每轮访问帖子页和回复页', async () => {
    const { visit } = healthyTimeline()
    await import('./watch.ts')
    await vi.advanceTimersByTimeAsync(599_999)

    expect(visit.mock.calls).toEqual([['/Keyshotvv'], ['/Keyshotvv/with_replies']])

    await vi.advanceTimersByTimeAsync(1)
    expect(visit).toHaveBeenCalledTimes(3)
  })

  it('正常站内跳转时，每两小时才主动整页刷新一次', async () => {
    const { navigate } = healthyTimeline()
    await import('./watch.ts')
    await vi.advanceTimersByTimeAsync(2 * 3600_000 - 1)

    expect(navigate).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(10_001)
    expect(navigate).toHaveBeenCalledTimes(2)
  })
})
