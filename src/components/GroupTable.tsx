import type { GroupRow } from '../lib/stats'
import { fmtNum, fmtPct, fmtR, signClass } from '../lib/format'

/** 分组统计表：每行一个维度值，带期望值条形 */
export default function GroupTable({ rows, label }: { rows: GroupRow[]; label: string }) {
  if (rows.length === 0) return <div className="empty">暂无数据</div>
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.stats.expectancyR ?? 0)), 0.01)
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            <th className="num">笔数</th>
            <th className="num">胜率</th>
            <th className="num">盈亏比</th>
            <th className="num">利润因子</th>
            <th className="num">总 R</th>
            <th>期望值 / 笔</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, stats: s }) => (
            <tr key={key}>
              <td>{key}</td>
              <td className="num">
                {s.trades}
                <span className="muted"> ({s.wins}/{s.losses}/{s.breakevens})</span>
              </td>
              <td className="num">{fmtPct(s.winRate)}</td>
              <td className="num">{fmtNum(s.payoffRatio)}</td>
              <td className="num">{fmtNum(s.profitFactor)}</td>
              <td className={`num ${signClass(s.totalR)}`}>{fmtR(s.totalR, 1)}</td>
              <td>
                <div className="bar-cell">
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${(s.expectancyR ?? 0) >= 0 ? 'pos-bg' : 'neg-bg'}`}
                      style={{
                        width: `${(Math.abs(s.expectancyR ?? 0) / maxAbs) * 50}%`,
                        left: (s.expectancyR ?? 0) >= 0 ? '50%' : `${50 - (Math.abs(s.expectancyR ?? 0) / maxAbs) * 50}%`,
                      }}
                    />
                  </div>
                  <span className={signClass(s.expectancyR)}>{fmtR(s.expectancyR)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
