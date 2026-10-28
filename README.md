# Trading Journal

ICT 交易日志 + 学习笔记 + 统计仪表盘 + AI 导师。

- 交易和每日日志用 **Markdown + YAML frontmatter** 记录，Git 管理版本
- 前端（pnpm + Vite + React + TypeScript）负责回顾、可视化和统计
- 所有统计以 **R 倍数** 为单位，记录方式参考《Trade Psychology & Effective Journaling》：既统计结果，也统计执行过程和心理状态
- 学习笔记覆盖 ICT 概念（附 K 线示意图）和交易心理；导师资料从 [@Keyshotvv](https://x.com/Keyshotvv) 的公开内容提炼，配合 Claude Code 的 `keyshot-mentor` skill 点评日志

## 快速开始

```bash
pnpm install
pnpm dev              # 启动仪表盘 http://localhost:5173
pnpm new:trade NQ     # 新建交易 → journal/trades/YYYY/YYYY-MM-DD-nq-01.md
pnpm new:day          # 新建今天的日志 → journal/days/YYYY-MM-DD.md
pnpm trade:chart <id> # 用真实 K 线生成交易复盘图（日线 / 4H / 1H，目前支持 Binance 永续）
pnpm diagrams         # 重新生成笔记中的 K 线示意图（notes/ict/img/*.svg）
pnpm mentor:collect   # 生成导师内容采集脚本（复制到剪贴板，在 X 页面控制台运行）
pnpm mentor:ingest    # 合并下载的采集结果，生成待提炼清单
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
| 学习笔记 | 渲染 `notes/` 下的 Markdown 和插图，按主题分组：ICT、交易心理 & 日志、导师、自然交易理论、RSI |

## 目录结构

```
journal/
  trades/YYYY/        每笔交易一个 .md
  trades/_example/    示例数据（可删除）
  days/               每日日志
  screenshots/        图表截图，以及 trade:chart 生成的复盘图
  charts/             复盘图的旁注（<id>.json：时区、EQH、信号 K 等手动标注）
  templates/          trade.md / day.md 模板
notes/                学习资料
  ict/                ICT 概念、模型、检查清单、术语表；img/ 为生成的 K 线示意图
  psychology/         交易心理与日志方法、情绪词汇表、错误分类、交易计划模板、课程笔记
  mentors/keyshotvv/  导师资料：风格画像、交易规则、心态、原帖索引
  natural-trading-theory/  自然交易理论
  rsi/                RSI 等指标
docs/STATS.md         统计指标定义与解读
scripts/
  new-entry.ts        新建交易 / 日志
  trade-chart/        交易复盘图生成器
  diagrams/           K 线示意图生成器（数据在 ict.ts）
  mentor-sync/        导师内容同步：采集 → 合并 → 待提炼清单
.claude/skills/
  keyshot-mentor/     导师 skill：点评日志、分析行情、布置练习、更新导师资料
.github/workflows/    GitHub Pages 部署
data/                 本地数据（导师原文等，已 gitignore，不提交）
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

### 复盘图

加密货币交易可以用真实行情生成复盘图：

```bash
pnpm trade:chart 2026-10-28-btc-01
```

- 从 Binance USDT 永续拉取公开 K 线，生成 `journal/screenshots/<id>-1d.svg`、`-4h.svg`、`-1h.svg`，并自动写入交易的 `screenshots`
- 入场、止损、目标、出场自动标注；EQH、信号 K、震荡区间等写在 `journal/charts/<id>.json`（时间按其中的 `tz` 解释，默认纽约时间）
- 平仓后在旁注里填 `exitTime` 再运行一次，图会延伸到出场位置

每日日志模板见 [`journal/templates/day.md`](journal/templates/day.md)：`mood` `sleep` `dailyBias` `news` `maxTrades` `maxLossR` `rulesFollowed`。

## 统计指标

完整定义见 [docs/STATS.md](docs/STATS.md)。

- **结果**：胜率（不含保本）、盈亏比、期望值、利润因子、胜率优势（胜率 − 保本胜率）、最大回撤、连胜 / 连亏、SQN
- **过程**：按计划执行率、按计划 vs 违反计划对比、平均计划 R:R、盈利单兑现率、错误的代价、错过的机会
- **分维度**：Setup · 时段 / Killzone · 策略 · 品种 · PD Array · 评级 · 星期 · 方向 · HTF Bias 是否正确 · 交易前情绪 · 信心

`|R| < 0.1` 视为保本，阈值在 `src/lib/parse.ts` 的 `BREAKEVEN_THRESHOLD`。

## 学习笔记

- **ICT**：从 [学习路线](notes/ict/00-overview.md) 开始，依次是市场结构、流动性、PD Arrays、时间、HTF Bias、交易模型、风险执行；FVG、Order Block、Breaker、Unicorn、Power of 3、2022 Model 等配有 K 线示意图
- **交易心理 & 日志**：从 [目录](notes/psychology/00-overview.md) 开始；[情绪词汇表](notes/psychology/02-emotions.md) 和 [错误分类](notes/psychology/05-mistakes.md) 定义了日志中 `emotions`、`mistakes` 的统一用词
- **示意图**：改 `scripts/diagrams/ict.ts` 中的 K 线数据和标注，运行 `pnpm diagrams` 重新生成，不要手改 SVG

## AI 导师

`.claude/skills/keyshot-mentor/` 以 [导师资料](notes/mentors/keyshotvv/00-profile.md) 中的规则为标准，在 Claude Code 中直接说：

- 「让导师点评我今天的交易」「按 Keyshot 的标准复盘 2026-10-27-nq-01」：读取日志，逐项对照规则，给出结论、问题和作业
- 「导师怎么看这个行情」+ 日线 / 4H / 进场周期截图：按他的流程做情景分析（看不到实时行情，需要你提供图）
- 「更新导师资料」：见下一节

导师资料全部为转述，附原帖链接；导师不以他本人身份发言，也不提供投资建议。

## 更新导师资料

导师资料（`notes/mentors/keyshotvv/`）来自 [@Keyshotvv](https://x.com/Keyshotvv) 的公开内容，不定期同步：

1. `pnpm mentor:collect`：生成采集脚本并复制到剪贴板，自动从上次同步到的时间点继续
2. 在已登录 X 的浏览器打开 `https://x.com/Keyshotvv/with_replies`，在控制台（Cmd+Option+J）粘贴运行，等它自动滚动完成并下载 JSON
3. `pnpm mentor:ingest`：读取「下载」目录中最新的采集文件，去重后合并到 `data/mentors/keyshotvv/posts.json`，生成 `digest-*.md` 待提炼清单
4. 对 Claude 说「更新导师资料」：它会读清单，转述后更新规则、心态和原帖索引

原文只保存在本地的 `data/`（不提交）；仓库里只有转述和原帖链接。第一次运行时没有本地数据，会从今年 1 月 1 日开始采集。
