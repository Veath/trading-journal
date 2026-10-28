// 用法：pnpm new:trade [品种]   → journal/trades/YYYY/YYYY-MM-DD-品种-NN.md
//       pnpm new:day            → journal/days/YYYY-MM-DD.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [kind = 'trade', symbol = 'NQ'] = process.argv.slice(2)
const root = join(import.meta.dirname, '..')
const now = new Date()
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

if (kind !== 'trade' && kind !== 'day') {
  console.error(`未知类型 ${kind}，只支持 trade / day`)
  process.exit(1)
}

let template = readFileSync(join(root, 'journal/templates', `${kind}.md`), 'utf8').replace('{{date}}', date)
let file: string

if (kind === 'day') {
  mkdirSync(join(root, 'journal/days'), { recursive: true })
  file = join(root, 'journal/days', `${date}.md`)
} else {
  template = template.replace(/^symbol: .*$/m, `symbol: ${symbol}`)
  const dir = join(root, 'journal/trades', date.slice(0, 4))
  mkdirSync(dir, { recursive: true })
  let n = 1
  do {
    file = join(dir, `${date}-${symbol.toLowerCase()}-${String(n++).padStart(2, '0')}.md`)
  } while (existsSync(file))
}

if (existsSync(file)) {
  console.log(`已存在：${file}`)
} else {
  writeFileSync(file, template)
  console.log(`已创建：${file}`)
}
