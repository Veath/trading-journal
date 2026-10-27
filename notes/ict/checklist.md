# 入场前检查清单

每笔交易前逐项核对。右列为对应的日志字段，交易后直接照着填。

## 背景

- [ ] HTF bias 明确（不是 neutral）→ `htfBias`
- [ ] 知道 DOL 在哪，到目标空间足够 → `drawOnLiquidity`
- [ ] 当前价格在正确的区域：做多在折价区，做空在溢价区
- [ ] 没有即将发布的高影响数据（或已经发布完）

## 时间

- [ ] 在 Killzone / Silver Bullet 窗口内 → `session`、`time`
- [ ] 今天还没达到最大交易笔数 / 最大亏损 → 每日日志 `maxTrades`、`maxLossR`

## 触发

- [ ] 入场前已经扫掉一侧流动性 → `liquiditySweep`
- [ ] 有位移 + MSS
- [ ] 入场点在明确的 PD Array 上 → `pdArrays`
- [ ] 符合我写好规则的某个模型 → `setup`

## 风险

- [ ] 止损在交易逻辑失效的位置 → `stop`
- [ ] 目标是流动性，计划 R:R ≥ 2 → `target`
- [ ] 仓位按固定风险计算 → `size`

## 心理

- [ ] 我现在的情绪是什么？→ `emotions.before`（见 [情绪词汇表](../psychology/02-emotions.md)）
- [ ] 如果这笔亏损，我能平静接受吗？
- [ ] 这是计划内的交易，而不是想弥补上一笔？

**全部打勾 → A / A+；缺一两项 → B；缺关键项 → 不做，或者如实记录 `mistakes: [no-setup]`。**
