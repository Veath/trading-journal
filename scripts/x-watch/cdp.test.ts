import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHROME, Cdp, closeBrowser, openBrowser } from './cdp.ts'

const { execFileSync, spawn } = vi.hoisted(() => ({ execFileSync: vi.fn(), spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync, spawn }))

const PID = 12345
const PORT = 58626
const VERSION = {
  Browser: 'Chrome/157.0.8103.40',
  'Protocol-Version': '1.3',
  'User-Agent': 'Mozilla/5.0 HeadlessChrome/157.0.0.0 Safari/537.36',
  'V8-Version': '15.7',
  'WebKit-Version': '537.36',
  webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/browser/test-browser`,
}

function child() {
  return Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as string | null,
    unref: vi.fn(),
    kill: vi.fn(),
  })
}

describe('Chrome 启动和恢复', () => {
  let profile: string
  let running: boolean
  let listening: boolean
  let cdp: Cdp
  let chrome: ReturnType<typeof child>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    profile = mkdtempSync(join(tmpdir(), 'x-watch-cdp-'))
    symlinkSync(`test-host-${PID}`, join(profile, 'SingletonLock'))
    running = true
    listening = true
    chrome = child()
    spawn.mockReturnValue(chrome)
    execFileSync.mockImplementation((command: string, args: string[]) => {
      if (command === 'ps' && args.includes(String(PID)))
        return running ? `${CHROME} --user-data-dir=${profile} --remote-debugging-port=0 --headless=new about:blank\n` : ''
      if (command === 'lsof' && args.includes(String(PID)))
        return listening ? `p${PID}\nn127.0.0.1:${PORT}\n` : ''
      throw new Error(`不应执行：${command} ${args.join(' ')}`)
    })
    cdp = {
      closed: false,
      send: vi.fn(async (method: string) => {
        if (method === 'Browser.getVersion') return { userAgent: VERSION['User-Agent'] }
        return {}
      }),
      close: vi.fn(),
    } as unknown as Cdp
    vi.spyOn(Cdp, 'connect').mockResolvedValue(cdp)
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (!listening) throw new Error('ECONNREFUSED')
      if (input === `http://127.0.0.1:${PORT}/json/version`) return Response.json(VERSION)
      if (input === `http://127.0.0.1:${PORT}/json/list`)
        return Response.json([{ type: 'page', url: 'about:blank', webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/page/test-page` }])
      throw new Error(`不应请求：${input}`)
    }))
  })

  afterEach(() => {
    chrome.stderr.destroy()
    rmSync(profile, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function portFile() {
    writeFileSync(join(profile, 'DevToolsActivePort'), `${PORT}\n/devtools/browser/test-browser`)
  }

  it('端口文件丢失时仍能接管该用户目录正在运行的 Chrome', async () => {
    const opening = expect(openBrowser(profile, true)).resolves.toBe(cdp)
    await Promise.all([opening, vi.runAllTimersAsync()])
    expect(spawn).not.toHaveBeenCalled()
  })

  it('端口探测短暂失败时不删除仍在运行的 Chrome 的端口文件', async () => {
    portFile()
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ETIMEDOUT'))
    const opening = expect(openBrowser(profile, true)).resolves.toBe(cdp)
    await Promise.all([opening, vi.runAllTimersAsync()])
    expect(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8')).toBe(`${PORT}\n/devtools/browser/test-browser`)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('关闭浏览器时等待进程释放用户目录，即使调试端口已先关闭', async () => {
    portFile()
    vi.mocked(cdp.send).mockImplementation(async () => {
      listening = false
      setTimeout(() => { running = false }, 3000)
      return {}
    })
    const closing = closeBrowser(profile, cdp).then(() => { expect(running).toBe(false) })
    await Promise.all([closing, vi.runAllTimersAsync()])
  })

  it('用户目录被不带调试端口的 Chrome 占用时提示关闭窗口', async () => {
    listening = false
    execFileSync.mockImplementation((command: string) => {
      if (command === 'ps') return `${CHROME} --user-data-dir=${profile} https://x.com/home\n`
      return ''
    })
    const opening = expect(openBrowser(profile, false)).rejects.toThrow(/用户目录.*占用.*关闭/)
    await Promise.all([opening, vi.runAllTimersAsync()])
    expect(spawn).not.toHaveBeenCalled()
  })

  it('Chrome 忽略关闭命令时只正常终止已核对的监控进程', async () => {
    portFile()
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      expect(pid).toBe(PID)
      expect(signal).toBe('SIGTERM')
      running = false
      listening = false
      return true
    })
    const closing = expect(closeBrowser(profile, cdp)).resolves.toBeUndefined()
    await Promise.all([closing, vi.runAllTimersAsync()])
    expect(kill).toHaveBeenCalledOnce()
  })

  it('Chrome 提前退出时立即报告退出码和错误原因', async () => {
    running = false
    listening = false
    setTimeout(() => {
      chrome.stderr.write('Failed to create a ProcessSingleton for your profile directory.\n')
      chrome.exitCode = 21
      chrome.emit('exit', 21, null)
    }, 100)
    const start = Date.now()
    const opening = expect(openBrowser(profile, false)).rejects.toThrow(/21.*ProcessSingleton/)
    await Promise.all([opening, vi.runAllTimersAsync()])
    expect(Date.now() - start).toBeLessThan(20_000)
  })
})
