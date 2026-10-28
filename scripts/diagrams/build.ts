// 用法：pnpm diagrams  → 生成 notes/<主题>/img/*.svg
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from './render.ts'
import { allDiagrams } from './all.ts'

for (const [topic, diagrams] of Object.entries(allDiagrams)) {
  const outDir = join(import.meta.dirname, `../../notes/${topic}/img`)
  mkdirSync(outDir, { recursive: true })
  for (const d of diagrams) {
    writeFileSync(join(outDir, `${d.file}.svg`), render(d))
    console.log(`notes/${topic}/img/${d.file}.svg`)
  }
}
