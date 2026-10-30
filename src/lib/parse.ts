import { parse as parseYaml } from 'yaml'
import type { AgentBiasDay, AgentBiasFrontmatter, DayEntry, DayEntryFrontmatter, Outcome, Trade, TradeFrontmatter } from '../types'

/** |R| 小于该值视为保本（breakeven），不计入胜负 */
export const BREAKEVEN_THRESHOLD = 0.1

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const m = FRONTMATTER_RE.exec(raw)
  if (!m) return { data: {}, body: raw }
  const data = (parseYaml(m[1]) ?? {}) as Record<string, unknown>
  return { data, body: m[2].trim() }
}

/** YAML 会把 2026-10-27 解析成 Date，统一转回字符串 */
function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? '')
}

export function computeRMultiple(t: TradeFrontmatter): number | null {
  if (typeof t.r === 'number') return t.r
  const { entry, stop, exit } = t
  if (entry == null || stop == null || exit == null) return null
  const risk = Math.abs(entry - stop)
  if (risk === 0) return null
  const sign = t.direction === 'long' ? 1 : -1
  return ((exit - entry) * sign) / risk
}

export function computePlannedRR(t: TradeFrontmatter): number | null {
  return plannedRR(t.entry, t.stop, t.target)
}

export function plannedRR(entry?: number, stop?: number, target?: number): number | null {
  if (entry == null || stop == null || target == null) return null
  const risk = Math.abs(entry - stop)
  if (risk === 0) return null
  return Math.abs(target - entry) / risk
}

export function classifyOutcome(r: number | null, threshold = BREAKEVEN_THRESHOLD): Outcome | null {
  if (r == null) return null
  if (r > threshold) return 'win'
  if (r < -threshold) return 'loss'
  return 'breakeven'
}

export function parseTrade(id: string, raw: string): Trade {
  const { data, body } = splitFrontmatter(raw)
  const fm = { ...data, date: normalizeDate(data.date) } as unknown as TradeFrontmatter
  const status = fm.status ?? 'closed'
  const rMultiple = status === 'open' ? null : computeRMultiple(fm)
  return {
    ...fm,
    id,
    status,
    body,
    rMultiple,
    plannedRR: computePlannedRR(fm),
    outcome: classifyOutcome(rMultiple),
    weekday: new Date(`${fm.date}T00:00:00`).getDay(),
  }
}

export function parseDay(id: string, raw: string): DayEntry {
  const { data, body } = splitFrontmatter(raw)
  const fm = { ...data, date: normalizeDate(data.date ?? id) } as unknown as DayEntryFrontmatter
  return { ...fm, id, body }
}

export function parseAgentBias(id: string, raw: string): AgentBiasDay {
  const { data, body } = splitFrontmatter(raw)
  const fm = { ...data, date: normalizeDate(data.date ?? id) } as unknown as AgentBiasFrontmatter
  return { ...fm, id, body, watch: (fm.watch ?? []).map((w) => ({ ...w, status: w.status ?? 'watching' })) }
}

export function sortByDate<T extends { date: string; time?: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    `${a.date} ${a.time ?? ''} ${a.id}`.localeCompare(`${b.date} ${b.time ?? ''} ${b.id}`),
  )
}
