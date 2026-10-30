import { Suspense, lazy } from 'react'
import type { AgentBiasDay, BiasDirection, WatchStatus } from '../types'
import { agentBias } from '../lib/load'
import { fmtNum } from '../lib/format'
import { plannedRR } from '../lib/parse'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'
import { handleRepoLinkClick } from '../lib/links'

// 行情图按需加载，不进首页的包
const BiasChart = lazy(() => import('../components/BiasChart'))

export const BIAS_LABEL: Record<BiasDirection, string> = { bullish: '偏多', bearish: '偏空', neutral: '中性' }
export const BIAS_CLASS: Record<BiasDirection, string> = { bullish: 'long', bearish: 'short', neutral: '' }
export const STATUS_LABEL: Record<WatchStatus, string> = { watching: '观察中', triggered: '已触发', invalidated: '已失效', expired: '已过期' }
export const STATUS_CLASS: Record<WatchStatus, string> = { watching: 'open', triggered: '', invalidated: 'missed', expired: 'missed' }

function Watch({ day, watch: w }: { day: AgentBiasDay; watch: AgentBiasDay['watch'][number] }) {
  const prices = [w.entry, w.stop].some((v) => v != null) ? `${w.entry ?? '—'} / ${w.stop ?? '—'}` : undefined
  const targets = w.targets?.map((t, i) => {
    const rr = plannedRR(w.entry, w.stop, t)
    return `TP${i + 1} ${t}${rr == null ? '' : `（${fmtNum(rr, 1)}R）`}`
  }).join('，')
  const fields: [string, string | undefined][] = [
    ['为什么关注', w.reason],
    ['等什么条件', w.trigger],
    ['什么情况放弃', w.invalidation],
    ['计划进场区', w.entryZone && `${w.entryZone.bottom}–${w.entryZone.top}`],
    ['示例进场 / 止损', prices],
    ['目标', targets],
  ]
  return (
    <>
      <section className="card">
        <div className="detail-title">
          <h1>{w.symbol}</h1>
          <span className={`dir ${BIAS_CLASS[w.bias]}`}>{BIAS_LABEL[w.bias]}</span>
          <span className={`status ${STATUS_CLASS[w.status]}`}>{STATUS_LABEL[w.status]}</span>
        </div>
        {w.setup && <p className="sub">{w.setup}</p>}
        <dl className="bias-fields">
          {fields.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Suspense fallback={<section className="card"><div className="trade-chart" /></section>}>
        <BiasChart day={day} watch={w} />
      </Suspense>
    </>
  )
}

export default function AgentBiasDetail({ id }: { id: string }) {
  const index = agentBias.findIndex((d) => d.id === id)
  const d = agentBias[index]
  if (!d) return <div className="empty card">找不到 {id} 的 Agent偏见</div>
  const prev = agentBias[index - 1]
  const next = agentBias[index + 1]
  return (
    <div className="stack">
      <div className="pager">
        <a href={href('bias')}>← 全部日期</a>
        <span>
          {prev && <a href={href('bias', prev.id)}>‹ 上一天</a>} {next && <a href={href('bias', next.id)}>下一天 ›</a>}
        </span>
      </div>
      <section className="card" onClick={(e) => handleRepoLinkClick(e, `journal/agent-bias/${d.id}.md`)}>
        <div className="detail-title">
          <h1>{d.date}</h1>
          <span className="tag">Agent 的看法，不是交易指令</span>
        </div>
        {d.time && <p className="sub">分析时间 {d.time}（UTC{d.tz ?? '+08:00'}）</p>}
        {d.body && <Markdown source={d.body} />}
      </section>
      {d.watch.map((w) => <Watch key={w.symbol} day={d} watch={w} />)}
    </div>
  )
}
