// 用法：pnpm diagrams  → 生成 notes/ict/img/*.svg
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from './render.ts'
import { ictDiagrams } from './ict.ts'

const outDir = join(import.meta.dirname, '../../notes/ict/img')
mkdirSync(outDir, { recursive: true })
for (const d of ictDiagrams) {
  writeFileSync(join(outDir, `${d.file}.svg`), render(d))
  console.log(`notes/ict/img/${d.file}.svg`)
}
