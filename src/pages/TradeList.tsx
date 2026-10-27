import type { Trade } from '../types'
import { fmtNum, fmtR, signClass } from '../lib/format'
import { href } from '../lib/router'

const STATUS_LABEL = { closed: '', open: '持仓中', missed: '错过' }

export default function TradeList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <div className="empty card">还没有交易记录。运行 <code>pnpm new:trade</code> 新建一笔。</div>
  }
  return (
    <section className="card">
      <h2>交易记录 <span className="muted">({trades.length})</span></h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>品种</th>
              <th>方向</th>
              <th>策略 / Setup</th>
              <th>时段</th>
              <th>评级</th>
              <th className="num">计划 R:R</th>
              <th className="num">结果</th>
              <th>纪律</th>
            </tr>
          </thead>
          <tbody>
            {[...trades].reverse().map((t) => (
              <tr key={t.id} className="clickable" onClick={() => (window.location.hash = href('trades', t.id))}>
                <td>
                  <a href={href('trades', t.id)}>{t.date}</a> <span className="muted">{t.time}</span>
                </td>
                <td>{t.symbol}</td>
                <td>{t.direction === 'long' ? '多' : '空'}</td>
                <td>
                  {t.strategy}
                  {t.setup && <span className="muted"> · {t.setup}</span>}
                </td>
                <td>{t.session}</td>
                <td>{t.grade}</td>
                <td className="num">{fmtNum(t.plannedRR, 1)}</td>
                <td className={`num ${t.status === 'closed' ? signClass(t.rMultiple) : 'muted'}`}>
                  {t.status === 'closed' ? fmtR(t.rMultiple) : STATUS_LABEL[t.status]}
                </td>
                <td>
                  {t.followedPlan === false ? <span className="tag warn">违反计划</span> : null}
                  {t.mistakes?.map((m) => (
                    <span key={m} className="tag">{m}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
