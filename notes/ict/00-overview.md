# ICT 学习路线

ICT（Inner Circle Trader）的核心观点：价格由算法在 **流动性** 与 **低效区（PD Arrays）** 之间投递，并且在特定 **时间** 窗口更活跃。所有模型都是这三件事的组合：

> **时间（When）+ 流动性（Where to / Where from）+ PD Array（Where to enter）**

## 建议学习顺序

| # | 主题 | 解决的问题 |
|---|---|---|
| 1 | [市场结构](./01-market-structure.md) | 现在是谁在控制？结构是否转变？ |
| 2 | [流动性](./02-liquidity.md) | 价格要去哪里（DOL）？刚刚从哪里拿了流动性？ |
| 3 | [PD Arrays](./03-pd-arrays.md) | 在哪里入场？FVG / OB / Breaker / Premium & Discount |
| 4 | [时间与时段](./04-time.md) | 什么时候交易？Killzone、Silver Bullet、Power of 3 |
| 5 | [HTF Bias 与自上而下分析](./05-htf-bias.md) | 今天做多还是做空？ |
| 6 | [交易模型](./06-models.md) | 把以上组合成可重复执行的 setup |
| 7 | [风险与执行](./07-risk-execution.md) | 止损、目标、仓位、管理 |
| ✓ | [入场前检查清单](./checklist.md) | 每笔交易前逐项核对，对应日志字段 |
| 📖 | [术语表](./glossary.md) | 缩写速查 |

## 学习方法

1. **一次只练一个模型**。先把一个 setup（如 Silver Bullet）在一个品种、一个时段做到 30 笔以上样本，再扩展。
2. **先回放（backtest）再实盘**。回放的交易也可以记录到日志里，用 `tags: [backtest]` 区分。
3. **用数据验证概念**。仪表盘按 `setup`、`session`、`pdArrays`、`biasCorrect` 分组，看看哪些概念在你手里真的有效。
4. **截图是最好的笔记**。每笔交易至少保存 HTF 背景图和入场周期图各一张。

> 本目录是基于公开 ICT 概念整理的学习笔记，不同年份的 ICT 教学在细节（时间窗口、定义）上存在差异，以你学习的版本为准并随时修订。
