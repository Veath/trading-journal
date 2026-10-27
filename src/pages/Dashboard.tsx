import { useMemo, useState } from 'react'
import type { Trade } from '../types'
import { computeStats, equityCurve, groupStats, mistakeCosts, rDistribution } from '../lib/stats'
import { fmtMoney, fmtNum, fmtPct, fmtR, signClass, WEEKDAYS } from '../lib/format'
import Kpi from '../components/Kpi'
import EquityChart from '../components/EquityChart'
import RHistogram from '../components/RHistogram'
import GroupTable from '../components/GroupTable'

const DIMENSIONS: { key: string; label: string; fn: (t: Trade) => string | string[] | undefined }[] = [
  { key: 'setup', label: 'Setup', fn: (t) => t.setup },
  { key: 'session', label: '时段 / Killzone', fn: (t) => t.session },
  { key: 'strategy', label: '策略', fn: (t) => t.strategy },
  { key: 'symbol', label: '品种', fn: (t) => t.symbol },
  { key: 'pdArrays', label: 'PD Array', fn: (t) => t.pdArrays },
  { key: 'grade', label: '评级', fn: (t) => t.grade },
  { key: 'weekday', label: '星期', fn: (t) => WEEKDAYS[t.weekday] },
  { key: 'direction', label: '方向', fn: (t) => (t.direction === 'long' ? '做多' : '做空') },
  { key: 'bias', label: 'HTF Bias 是否正确', fn: (t) => (t.biasCorrect == null ? undefined : t.biasCorrect ? '正确' : '错误') },
  { key: 'emotion', label: '交易前情绪', fn: (t) => t.emotions?.before },
  { key: 'confidence', label: '信心 (1-5)', fn: (t) => (t.confidence == null ? undefined : String(t.confidence)) },
]

export default function Dashboard({ trades }: { trades: Trade[] }) {
  const s = useMemo(() => computeStats(trades), [trades])
  const curve = useMemo(() => equityCurve(trades), [trades])
  const buckets = useMemo(() => rDistribution(trades), [trades])
  const mistakes = useMemo(() => mistakeCosts(trades), [trades])
  const [dim, setDim] = useState(DIMENSIONS[0].key)
  const dimension = DIMENSIONS.find((d) => d.key === dim)!
  const groups = useMemo(() => groupStats(trades, dimension.fn), [trades, dimension])
  const byPlan = useMemo(
    () => groupStats(trades.filter((t) => t.followedPlan != null), (t) => (t.followedPlan ? '按计划执行' : '违反计划')),
    [trades],
  )
  // 错过的单按「如果做了」的 exit 计算潜在 R
  const missedR = trades.filter((t) => t.status === 'missed').reduce((a, t) => a + (t.rMultiple ?? 0), 0)

  const edge = s.winRate != null && s.breakevenWinRate != null ? s.winRate - s.breakevenWinRate : null

  return (
    <div className="stack">
      <section className="kpis">
        <Kpi label="总 R" value={fmtR(s.totalR, 1)} tone={signClass(s.totalR)} hint={s.totalPnl != null ? `盈亏 ${fmtMoney(s.totalPnl)}` : `${s.trades} 笔已平仓`} />
        <Kpi label="胜率" value={fmtPct(s.winRate)} hint={`${s.wins} 胜 / ${s.losses} 负 / ${s.breakevens} 保本`} title="盈 / (盈 + 亏)，保本单不计入" />
        <Kpi label="盈亏比" value={fmtNum(s.payoffRatio)} hint={`均盈 ${fmtR(s.avgWinR)} / 均亏 ${fmtR(s.avgLossR)}`} title="平均盈利 R / |平均亏损 R|" />
        <Kpi label="期望值" value={fmtR(s.expectancyR)} tone={signClass(s.expectancyR)} hint="平均每笔交易的 R" />
        <Kpi label="利润因子" value={fmtNum(s.profitFactor)} hint="总盈利 R / 总亏损 R" />
        <Kpi
          label="胜率优势"
          value={edge == null ? '—' : `${edge > 0 ? '+' : ''}${(edge * 100).toFixed(1)}%`}
          tone={signClass(edge)}
          hint={`保本所需胜率 ${fmtPct(s.breakevenWinRate)}`}
          title="实际胜率 − 当前盈亏比下的保本胜率"
        />
        <Kpi label="最大回撤" value={fmtR(s.maxDrawdownR, 1)} tone={signClass(s.maxDrawdownR)} hint={`最长连亏 ${s.maxLossStreak} · 连胜 ${s.maxWinStreak}`} />
        <Kpi label="SQN" value={fmtNum(s.sqn)} hint={sqnLabel(s.sqn)} title="√N × 期望 / R 标准差；样本 < 30 时参考意义有限" />
      </section>

      <section className="card">
        <h2>权益曲线</h2>
        <p className="sub">按交易顺序的累计 R；点击曲线可跳转到对应交易</p>
        <EquityChart points={curve} />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>R 分布</h2>
          <p className="sub">好的系统：亏损集中在 -1R，盈利有右侧长尾</p>
          <RHistogram buckets={buckets} />
        </section>
        <section className="card">
          <h2>执行质量</h2>
          <p className="sub">Trade Psychology：结果之外，更要统计过程</p>
          <div className="kpis compact">
            <Kpi label="按计划执行率" value={fmtPct(s.planAdherence)} />
            <Kpi label="平均计划 R:R" value={fmtNum(s.avgPlannedRR)} />
            <Kpi label="盈利单兑现率" value={fmtPct(s.avgCaptureRatio)} title="盈利单实际 R / 计划 R:R，过低说明经常提前离场" />
            <Kpi label="错过的机会" value={String(s.missed)} hint={s.missed ? `潜在 ${fmtR(missedR, 1)}` : undefined} />
          </div>
          {byPlan.length > 0 && <GroupTable rows={byPlan} label="纪律" />}
        </section>
      </div>

      <section className="card">
        <h2>错误的代价</h2>
        <p className="sub">每类错误出现在哪些交易里，这些交易一共贡献了多少 R</p>
        {mistakes.length === 0 ? (
          <div className="empty">没有记录错误标签 👍</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>错误</th>
                  <th className="num">次数</th>
                  <th className="num">合计 R</th>
                  <th className="num">平均 R</th>
                </tr>
              </thead>
              <tbody>
                {mistakes.map((m) => (
                  <tr key={m.mistake}>
                    <td>{m.mistake}</td>
                    <td className="num">{m.count}</td>
                    <td className={`num ${signClass(m.totalR)}`}>{fmtR(m.totalR, 1)}</td>
                    <td className={`num ${signClass(m.avgR)}`}>{fmtR(m.avgR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>分维度统计</h2>
            <p className="sub">找到你真正赚钱的 setup / 时段 / 状态；括号内为 胜/负/保本</p>
          </div>
          <select value={dim} onChange={(e) => setDim(e.target.value)}>
            {DIMENSIONS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <GroupTable rows={groups} label={dimension.label} />
      </section>
    </div>
  )
}

function sqnLabel(sqn: number | null): string {
  if (sqn == null) return '样本不足'
  if (sqn < 1.6) return '较差'
  if (sqn < 2) return '一般'
  if (sqn < 2.5) return '良好'
  if (sqn < 3) return '优秀'
  return '极佳'
}
