# Trading Journal

ICT 交易日志 + 学习笔记 + 统计仪表盘。

- 交易和每日日志用 **Markdown + YAML frontmatter** 记录，Git 管理版本
- 前端（pnpm + Vite + React + TypeScript）负责回顾、可视化和统计
- 所有统计以 **R 倍数** 为单位，记录方式参考《Trade Psychology & Effective Journaling》：既统计结果，也统计执行过程和心理状态

## 快速开始

```bash
pnpm install
pnpm dev              # 启动仪表盘 http://localhost:5173
pnpm new:trade NQ     # 新建交易 → journal/trades/YYYY/YYYY-MM-DD-nq-01.md
pnpm new:day          # 新建今天的日志 → journal/days/YYYY-MM-DD.md
pnpm diagrams         # 重新生成笔记中的 K 线示意图（notes/ict/img/*.svg）
pnpm test             # 单元测试
pnpm build            # 类型检查 + 打包
```

> `journal/trades/_example/` 和 `journal/days/2026-10-26.md` 是示例数据，看懂结构后删除，以免混入真实统计。

## 部署

推送到 `main` 后，GitHub Actions（`.github/workflows/deploy.yml`）会自动跑测试、打包并部署到 GitHub Pages：
<https://veath.github.io/trading-journal/>

新增交易或笔记后 push 即可更新线上仪表盘。注意仓库是公开的，交易记录对所有人可见。

## 页面

| 页面 | 内容 |
|---|---|
| 概览 | 核心指标、权益曲线（累计 R + 回撤）、R 分布、执行质量、错误的代价、分维度统计；可按时间 / 策略 / 品种筛选 |
| 交易 | 交易列表，点击查看详情（字段、截图、复盘正文），支持上一笔 / 下一笔 |
| 每日日志 | 盘前计划、心理检查、盘后复盘，并汇总当天交易的 R |
| 学习笔记 | 渲染 `notes/` 下的 Markdown |

## 目录结构

```
journal/
  trades/YYYY/        每笔交易一个 .md
  trades/_example/    示例数据（可删除）
  days/               每日日志
  screenshots/        图表截图
  templates/          trade.md / day.md 模板
notes/                学习资料
  ict/                ICT 概念与模型
  natural-trading-theory/  自然交易理论
  rsi/                RSI 等指标
  psychology/         交易心理课程笔记
docs/STATS.md         统计指标定义与解读
scripts/new-entry.ts  新建交易 / 日志
scripts/diagrams/     K 线示意图生成器（数据在 ict.ts）
src/
  types.ts            数据模型（字段说明见注释）
  lib/parse.ts        frontmatter 解析、R 计算、胜负判定
  lib/stats.ts        统计：胜率、盈亏比、期望值、回撤、分组等
  lib/load.ts         通过 import.meta.glob 加载 journal/ 与 notes/
  pages/ components/  界面
```

## 记录一笔交易

模板见 [`journal/templates/trade.md`](journal/templates/trade.md)。必填只有 `date / symbol / direction / strategy`，其余越完整，统计维度越多。

| 分组 | 字段 |
|---|---|
| 基本 | `date` `time` `symbol` `direction`(long/short) `status`(closed/open/missed) |
| ICT 背景 | `strategy` `setup` `session` `timeframe` `htfBias` `biasCorrect` `drawOnLiquidity` `liquiditySweep` `pdArrays` |
| 价格 | `entry` `stop` `target` `exit` `r` `size` `pnl` `fees` |
| 心理 & 执行 | `grade`(A+/A/B/C) `followedPlan` `confidence`(1-5) `emotions.before/during/after` `mistakes` |
| 其他 | `tags` `screenshots`（文件名，图片放 `journal/screenshots/`） |

- 填了 `entry / stop / exit` 自动计算 R；填了 `target` 计算计划 R:R
- 分批止盈、移动止损等无法用单一出场价表达时，直接写 `r:`（优先级最高）
- `status: missed`：符合计划但没做的机会，用「如果做了」的 exit 计算潜在 R，不计入正式统计
- 正文按模板写：交易前计划 → 交易中执行 → 交易后复盘 → 一句话教训

每日日志模板见 [`journal/templates/day.md`](journal/templates/day.md)：`mood` `sleep` `dailyBias` `news` `maxTrades` `maxLossR` `rulesFollowed`。

## 统计指标

完整定义见 [docs/STATS.md](docs/STATS.md)。

- **结果**：胜率（不含保本）、盈亏比、期望值、利润因子、胜率优势（胜率 − 保本胜率）、最大回撤、连胜 / 连亏、SQN
- **过程**：按计划执行率、按计划 vs 违反计划对比、平均计划 R:R、盈利单兑现率、错误的代价、错过的机会
- **分维度**：Setup · 时段 / Killzone · 策略 · 品种 · PD Array · 评级 · 星期 · 方向 · HTF Bias 是否正确 · 交易前情绪 · 信心

`|R| < 0.1` 视为保本，阈值在 `src/lib/parse.ts` 的 `BREAKEVEN_THRESHOLD`。
