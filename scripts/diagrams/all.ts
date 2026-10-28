// 各主题的示意图，键为 notes/ 下的目录名
import type { Diagram } from './render.ts'
import { ictDiagrams } from './ict.ts'
import { rsiDiagrams } from './rsi.ts'
import { vwapDiagrams } from './vwap.ts'
import { frvpDiagrams } from './frvp.ts'

export const allDiagrams: Record<string, Diagram[]> = {
  ict: ictDiagrams,
  rsi: rsiDiagrams,
  vwap: vwapDiagrams,
  frvp: frvpDiagrams,
}
