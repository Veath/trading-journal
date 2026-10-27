import { screenshotUrl, trades } from '../lib/load'
import { fmtMoney, fmtNum, fmtR, signClass } from '../lib/format'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'

export default function TradeDetail({ id }: { id: string }) {
  const index = trades.findIndex((t) => t.id === id)
  const t = trades[index]
  if (!t) return <div className="empty card">找不到交易 {id}</div>
  const prev = trades[index - 1]
  const next = trades[index + 1]

  const fields: [string, React.ReactNode][] = [
    ['日期', `${t.date} ${t.time ?? ''}`],
    ['品种 / 方向', `${t.symbol} · ${t.direction === 'long' ? '做多' : '做空'}`],
    ['策略 / Setup', [t.strategy, t.setup].filter(Boolean).join(' · ')],
    ['时段', t.session],
    ['入场周期', t.timeframe],
    ['HTF Bias', t.htfBias && `${t.htfBias}${t.biasCorrect == null ? '' : t.biasCorrect ? ' ✓' : ' ✗'}`],
    ['DOL', t.drawOnLiquidity],
    ['扫掉的流动性', t.liquiditySweep],
    ['PD Arrays', t.pdArrays?.join(', ')],
    ['入场 / 止损 / 目标 / 出场', [t.entry, t.stop, t.target, t.exit].map((v) => v ?? '—').join(' / ')],
    ['仓位', t.size],
    ['盈亏', t.pnl != null && <span className={signClass(t.pnl)}>{fmtMoney(t.pnl)}</span>],
    ['评级', t.grade],
    ['按计划执行', t.followedPlan == null ? undefined : t.followedPlan ? '是' : '否'],
    ['信心', t.confidence && `${t.confidence} / 5`],
    ['情绪 前 → 中 → 后', t.emotions && [t.emotions.before, t.emotions.during, t.emotions.after].map((e) => e ?? '—').join(' → ')],
  ]

  return (
    <div className="stack">
      <div className="pager">
        <a href={href('trades')}>← 全部交易</a>
        <span>
          {prev && <a href={href('trades', prev.id)}>‹ 上一笔</a>} {next && <a href={href('trades', next.id)}>下一笔 ›</a>}
        </span>
      </div>
      <section className="card">
        <div className="detail-head">
          <h1>
            {t.symbol} {t.setup ?? t.strategy}
          </h1>
          <div className={`big-r ${signClass(t.rMultiple)}`}>
            {t.status === 'closed' ? fmtR(t.rMultiple) : t.status === 'open' ? '持仓中' : `错过 (${fmtR(t.rMultiple)})`}
            <span className="muted"> / 计划 {fmtNum(t.plannedRR, 1)}R</span>
          </div>
        </div>
        <dl className="fields">
          {fields
            .filter(([, v]) => v != null && v !== '' && v !== false)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        {(t.mistakes?.length || t.tags?.length) ? (
          <div className="tags">
            {t.mistakes?.map((m) => <span key={m} className="tag warn">{m}</span>)}
            {t.tags?.map((m) => <span key={m} className="tag">{m}</span>)}
          </div>
        ) : null}
      </section>
      {t.screenshots?.length ? (
        <section className="card shots">
          {t.screenshots.map((s) => {
            const url = screenshotUrl(s)
            return url ? (
              <a key={s} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={s} />
              </a>
            ) : (
              <div key={s} className="empty">找不到截图 journal/screenshots/{s}</div>
            )
          })}
        </section>
      ) : null}
      {t.body && (
        <section className="card">
          <Markdown source={t.body} />
        </section>
      )}
    </div>
  )
}
