import type { Trade } from '../types'
import { fmtNum, fmtR, signClass } from '../lib/format'
import { href } from '../lib/router'

const STATUS_LABEL = { closed: '', open: '持仓中', missed: '错过' }

export default function TradeList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <div className="empty card">当前筛选下没有交易。调整筛选条件，或运行 <code>pnpm new:trade</code> 新建一笔。</div>
  }
  const rows = [...trades].reverse()
  return (
    <section className="card">
      <h2>
        交易记录 <span className="muted">{trades.length} 笔</span>
      </h2>
      {/* 窄屏：卡片列表 */}
      <ul className="trade-cards">
        {rows.map((t) => (
          <li key={t.id}>
            <a href={href('trades', t.id)}>
              <div className="tc-main">
                <span className="tc-symbol">
                  {t.symbol}
                  <span className={`dir ${t.direction}`}>{t.direction === 'long' ? '多' : '空'}</span>
                </span>
                <span className="tc-setup">{t.setup ?? t.strategy}</span>
              </div>
              <div className={`tc-r ${t.status === 'closed' ? signClass(t.rMultiple) : 'muted'}`}>
                {t.status === 'closed' ? fmtR(t.rMultiple) : STATUS_LABEL[t.status]}
              </div>
              <div className="tc-meta">
                {t.date} {t.time} {t.session && `· ${t.session}`} {t.grade && `· ${t.grade}`}
              </div>
              {(t.followedPlan === false || t.mistakes?.length) ? (
                <div className="tc-tags">
                  {t.followedPlan === false && <span className="tag warn">违反计划</span>}
                  {t.mistakes?.map((m) => (
                    <span key={m} className="tag">{m}</span>
                  ))}
                </div>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
      <div className="table-wrap trade-table">
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
            {rows.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => (window.location.hash = href('trades', t.id))}>
                <td>
                  <a href={href('trades', t.id)}>{t.date}</a> <span className="muted">{t.time}</span>
                </td>
                <td>{t.symbol}</td>
                <td>
                  <span className={`dir ${t.direction}`}>{t.direction === 'long' ? '多' : '空'}</span>
                </td>
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
