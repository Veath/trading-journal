import { agentBias } from '../lib/load'
import { href } from '../lib/router'
import { BIAS_LABEL, BIAS_CLASS, STATUS_CLASS, STATUS_LABEL } from './AgentBiasDetail'

export default function AgentBiasList() {
  if (agentBias.length === 0) {
    return <div className="empty card">还没有 Agent偏见。运行 <code>pnpm new:bias</code> 新建今天的一份。</div>
  }
  return (
    <section className="card">
      <h2>
        Agent偏见 <span className="count">{agentBias.length}</span> <span className="muted">天</span>
      </h2>
      <p className="sub">Agent 基于行情数据的看法和建议，不是你的交易计划，也不进入统计。</p>
      <ul className="bias-days">
        {[...agentBias].reverse().map((d) => (
          <li key={d.id}>
            <a href={href('bias', d.id)}>
              <span className="day-date">{d.date}</span>
              <span className="bias-symbols">
                {d.watch.map((w) => (
                  <span key={w.symbol} className="bias-symbol">
                    <span className="symbol">{w.symbol}</span>
                    <span className={`dir ${BIAS_CLASS[w.bias]}`}>{BIAS_LABEL[w.bias]}</span>
                    <span className={`status ${STATUS_CLASS[w.status]}`}>{STATUS_LABEL[w.status]}</span>
                  </span>
                ))}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
