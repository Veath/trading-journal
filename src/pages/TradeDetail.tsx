import { Suspense, lazy, useState } from 'react'
import { screenshotUrl, trades } from '../lib/load'
import { fmtMoney, fmtNum, fmtR, signClass } from '../lib/format'
import { href } from '../lib/router'
import Markdown from '../components/Markdown'
import RiskLadder from '../components/RiskLadder'
import { handleRepoLinkClick } from '../lib/links'

// 行情图按需加载，不进首页的包
const TradeChart = lazy(() => import('../components/TradeChart'))

export default function TradeDetail({ id }: { id: string }) {
  const index = trades.findIndex((t) => t.id === id)
  const t = trades[index]
  const [chartFailedId, setChartFailedId] = useState<string>()
  if (!t) return <div className="empty card">找不到交易 {id}</div>
  // pnpm trade:chart 生成的静态复盘图（<id>-1d.svg 等）与交互行情图内容相同：
  // 行情图正常时不显示；没有 time（不画行情图）或行情加载失败时作为兜底显示
  const generated = new RegExp(`^${t.id}-(1d|4h|1h|15m)\\.svg$`)
  const showGenerated = !t.time || chartFailedId === t.id
  const shots = (t.screenshots ?? []).filter((s) => showGenerated || !generated.test(s))
  const hasFallback = (t.screenshots ?? []).some((s) => generated.test(s) && screenshotUrl(s))
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
    ['入场 / 止损 / 目标 / 出场', <span className="num-v">{[t.entry, t.stop, t.target, t.exit].map((v) => v ?? '—').join(' / ')}</span>],
    ['仓位', t.size != null && <span className="num-v">{t.size}</span>],
    ['盈亏', t.pnl != null && <span className={`num-v ${signClass(t.pnl)}`}>{fmtMoney(t.pnl)}</span>],
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
          <div>
            <div className="detail-title">
              <h1>{t.symbol}</h1>
              <span className={`dir ${t.direction}`}>{t.direction === 'long' ? '多' : '空'}</span>
              {t.status !== 'closed' && <span className={`status ${t.status}`}>{t.status === 'open' ? '持仓中' : '错过'}</span>}
            </div>
            <p className="sub">
              {[t.strategy, t.setup].filter(Boolean).join(' · ')} · {t.date} {t.time}
            </p>
          </div>
          {t.status === 'open' ? (
            <div className="big-r">
              <span className="muted">计划 </span>
              {fmtNum(t.plannedRR, 1)}R
            </div>
          ) : (
            <div className={`big-r ${signClass(t.rMultiple)}`}>
              {fmtR(t.rMultiple)}
              <span className="muted"> / 计划 {fmtNum(t.plannedRR, 1)}R</span>
            </div>
          )}
        </div>
        <RiskLadder trade={t} />
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
      {t.time && (
        <Suspense fallback={<section className="card"><div className="trade-chart" /></section>}>
          <TradeChart key={t.id} trade={t} hasFallback={hasFallback} onError={() => setChartFailedId(t.id)} />
        </Suspense>
      )}
      {shots.length ? (
        <section className="card shots">
          {shots.map((s) => {
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
        <section className="card" onClick={(e) => handleRepoLinkClick(e, `journal/trades/${t.date.slice(0, 4)}/${t.id}.md`)}>
          <Markdown source={t.body} />
        </section>
      )}
    </div>
  )
}
