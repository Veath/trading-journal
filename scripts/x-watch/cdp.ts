// 极简 Chrome DevTools Protocol 客户端：用独立的 Chrome 用户目录启动（或复用已在运行的）浏览器，控制一个标签页。
// 不依赖 puppeteer / playwright，用 Node 自带的 WebSocket。
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
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

async function devtoolsPort(profile: string): Promise<number | null> {
  const file = join(profile, 'DevToolsActivePort')
  if (!existsSync(file)) return null
  const port = Number(readFileSync(file, 'utf8').split('\n')[0])
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    return res.ok ? port : null
  } catch {
    return null
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
  if (!port) {
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
    spawn(CHROME, args, { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 40 && !port; i++) {
      await sleep(500)
      port = await devtoolsPort(profile)
    }
    if (!port) throw new Error('Chrome 启动超时')
  }
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

/** 关闭该用户目录的调试版 Chrome（如果在运行），等端口释放 */
export async function closeBrowser(profile: string, cdp?: Cdp): Promise<void> {
  const port = await devtoolsPort(profile)
  if (!port) return
  if (cdp && !cdp.closed) await cdp.send('Browser.close').catch(() => {})
  else {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    const browser = await Cdp.connect(webSocketDebuggerUrl)
    await browser.send('Browser.close').catch(() => {})
  }
  for (let i = 0; i < 20 && (await devtoolsPort(profile)); i++) await sleep(500)
  await sleep(1500) // 等用户目录的锁释放
}
