import { days, trades } from '../lib/load'
import { closedTrades } from '../lib/stats'
import { fmtR, signClass } from '../lib/format'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'

export default function Days() {
  if (days.length === 0) {
    return <div className="empty card">还没有每日日志。运行 <code>pnpm new:day</code> 新建今天的盘前计划。</div>
  }
  return (
    <div className="stack">
      {[...days].reverse().map((d) => {
        const dayTrades = trades.filter((t) => t.date === d.date)
        const dayR = closedTrades(dayTrades).reduce((a, t) => a + t.rMultiple, 0)
        return (
          <section key={d.id} className="card">
            <div className="detail-head">
              <h2>{d.date}</h2>
              <div className={`big-r ${signClass(dayR)}`}>{dayTrades.length ? fmtR(dayR, 1) : '无交易'}</div>
            </div>
            <div className="tags">
              {d.dailyBias && <span className="tag">Bias: {d.dailyBias}</span>}
              {d.mood != null && <span className="tag">状态 {d.mood}/5</span>}
              {d.sleep != null && <span className="tag">睡眠 {d.sleep}h</span>}
              {d.news?.map((n) => <span key={n} className="tag">{n}</span>)}
              {d.rulesFollowed != null && (
                <span className={`tag ${d.rulesFollowed ? '' : 'warn'}`}>{d.rulesFollowed ? '守住纪律' : '未守纪律'}</span>
              )}
              {dayTrades.map((t) => (
                <a key={t.id} className="tag" href={href('trades', t.id)}>
                  {t.symbol} {t.status === 'closed' ? fmtR(t.rMultiple, 1) : t.status}
                </a>
              ))}
            </div>
            {d.body && <Markdown source={d.body} />}
          </section>
        )
      })}
    </div>
  )
}
