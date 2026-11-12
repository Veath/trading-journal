// 极简 Chrome DevTools Protocol 客户端：用独立的 Chrome 用户目录启动（或复用已在运行的）浏览器，控制一个标签页。
// 不依赖 puppeteer / playwright，用 Node 自带的 WebSocket。
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class Cdp {
  #ws: WebSocket
  #id = 0
  #pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  closed = false

  private constructor(ws: WebSocket) {
    this.#ws = ws
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data))
      const p = msg.id != null && this.#pending.get(msg.id)
      if (!p) return
      this.#pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${msg.error.message}`))
      else p.resolve(msg.result)
    }
    ws.onclose = () => {
      this.closed = true
      for (const p of this.#pending.values()) p.reject(new Error('浏览器连接已断开'))
      this.#pending.clear()
    }
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error(`无法连接 ${url}`))
    })
    return new Cdp(ws)
  }

  send<T = any>(method: string, params: object = {}): Promise<T> {
    const id = ++this.#id
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#ws.send(JSON.stringify({ id, method, params }))
    })
  }

  /** 在页面里执行 fn(arg)，返回可 JSON 序列化的结果 */
  async evaluate<A, R>(fn: (arg: A) => R, arg: A): Promise<R> {
    const res = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(arg)})`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text)
    return res.result.value as R
  }

  close() {
    this.#ws.close()
  }
}

/** 锁文件可能残留，必须核对 PID 确实属于这个用户目录的 Chrome 主进程。 */
function profilePid(profile: string): number | null {
  try {
    const pid = Number(readlinkSync(join(profile, 'SingletonLock')).match(/-(\d+)$/)?.[1])
    if (!Number.isSafeInteger(pid) || pid <= 0) return null
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 1500 }).trim()
    return command.startsWith(`${CHROME} `) && ` ${command} `.includes(` --user-data-dir=${profile} `) ? pid : null
  } catch {
    return null
  }
}

async function isDevtoolsPort(port: number, browserPath?: string): Promise<boolean> {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return false
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const version = await res.json()
    return typeof version['User-Agent'] === 'string' && /Chrome\//.test(version['User-Agent']) &&
      typeof version.webSocketDebuggerUrl === 'string' &&
      (!browserPath || new URL(version.webSocketDebuggerUrl).pathname === browserPath)
  } catch {
    return false
  }
}

async function devtoolsPort(profile: string): Promise<number | null> {
  try {
    const [value, browserPath] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n')
    const port = Number(value)
    if (await isDevtoolsPort(port, browserPath)) return port
  } catch { /* Chrome 尚未写入端口文件，或文件已丢失 */ }
  const pid = profilePid(profile)
  if (!pid) return null
  try {
    // 端口文件丢失或一次探测超时不代表 Chrome 已退出；只查该主进程的本地监听端口。
    const sockets = execFileSync('lsof', ['-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-nP', '-Fn'], {
      encoding: 'utf8', timeout: 1500,
    })
    for (const match of sockets.matchAll(/^n127\.0\.0\.1:(\d+)$/gm)) {
      const port = Number(match[1])
      if (await isDevtoolsPort(port)) return port
    }
  } catch { /* 普通 Chrome 没有调试端口 */ }
  return null
}

async function launchBrowser(profile: string, headless: boolean): Promise<number> {
  if (profilePid(profile)) {
    throw new Error('Chrome 用户目录正被占用，无法连接调试端口；请先关闭 x-watch 的 Chrome 窗口后重试')
  }
  if (!existsSync(CHROME)) throw new Error(`找不到 Chrome：${CHROME}`)
  rmSync(join(profile, 'DevToolsActivePort'), { force: true })
  const args = [
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1100,1000',
    ...(headless ? ['--headless=new'] : []),
    'about:blank',
  ]
  const chrome = spawn(CHROME, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let error: Error | undefined
  let stderr = ''
  chrome.once('error', (e) => { error = e })
  chrome.stderr?.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4096) })
  chrome.unref()
  try {
    for (let i = 0; i < 40; i++) {
      if (error) throw new Error(`Chrome 启动失败：${error.message}`)
      if (chrome.exitCode != null || chrome.signalCode != null) {
        throw new Error(`Chrome 启动失败（${chrome.signalCode ?? `退出码 ${chrome.exitCode}`}）：${stderr.trim() || '进程已退出'}`)
      }
      const port = await devtoolsPort(profile)
      if (port) return port
      await sleep(500)
    }
    throw new Error(`Chrome 启动超时${stderr.trim() ? `：${stderr.trim()}` : ''}`)
  } catch (e) {
    if (chrome.exitCode == null && chrome.signalCode == null) chrome.kill('SIGTERM')
    throw e
  } finally {
    chrome.stderr?.destroy()
  }
}

/** 复用该用户目录已在运行的 Chrome，否则新启动一个；返回一个标签页的连接 */
export async function openBrowser(profile: string, headless: boolean): Promise<Cdp> {
  let port = await devtoolsPort(profile)
  if (port) {
    // 已在运行的 Chrome 有没有窗口要和这次要求的一致，不一致就关掉重开
    const { 'User-Agent': ua } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    if (/HeadlessChrome/.test(ua) !== headless) {
      await closeBrowser(profile)
      port = null
    }
  }
  if (!port) port = await launchBrowser(profile, headless)
  const base = `http://127.0.0.1:${port}`
  const targets: { type: string; url: string; webSocketDebuggerUrl: string }[] = await (await fetch(`${base}/json/list`)).json()
  const page =
    targets.find((t) => t.type === 'page' && /^https:\/\/x\.com\//.test(t.url)) ??
    targets.find((t) => t.type === 'page') ??
    (await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json())
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  if (headless) {
    // 无头模式的 UA 带 HeadlessChrome，很容易被 Cloudflare 识别成自动程序
    const { userAgent } = await cdp.send<{ userAgent: string }>('Browser.getVersion')
    await cdp.send('Network.setUserAgentOverride', { userAgent: userAgent.replace('HeadlessChrome', 'Chrome') })
  }
  return cdp
}

/** 关闭该用户目录的调试版 Chrome，等主进程退出、用户目录释放后再返回。 */
export async function closeBrowser(profile: string, cdp?: Cdp): Promise<void> {
  const port = await devtoolsPort(profile)
  if (!port) return
  const pid = profilePid(profile)
  if (cdp && !cdp.closed) await cdp.send('Browser.close').catch(() => {})
  else {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    const browser = await Cdp.connect(webSocketDebuggerUrl)
    await browser.send('Browser.close').catch(() => {})
    browser.close()
  }
  for (let i = 0; i < 40; i++) {
    if (!profilePid(profile) && !(await devtoolsPort(profile))) return
    // 个别残留进程会响应 Browser.close 却不退出；SIGTERM 仍让 Chrome 正常写盘，且绝不处理其它进程。
    if (i === 20 && pid && profilePid(profile) === pid) process.kill(pid, 'SIGTERM')
    await sleep(500)
  }
  throw new Error('Chrome 尚未退出，用户目录仍被占用；请关闭 x-watch 的 Chrome 窗口后重试')
}
