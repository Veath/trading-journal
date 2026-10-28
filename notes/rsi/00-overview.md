# RSI 学习路线

RSI（Relative Strength Index，相对强弱指数）由 J. Welles Wilder 在 1978 年的《New Concepts in Technical Trading Systems》中提出，衡量一段时间内 **上涨力度与下跌力度的对比**，取值 0–100。

> RSI 描述的是 **动能（momentum）**，不是价格位置，也不是流动性。它回答「这一段走得有多猛、猛度在变强还是变弱」，不回答「价格要去哪里」。

## 建议学习顺序

| # | 主题 | 解决的问题 |
|---|---|---|
| 1 | [计算与参数](./01-calculation.md) | RSI 怎么算？Wilder 平滑、周期怎么选？ |
| 2 | [信号与读法](./02-signals.md) | 超买超卖、区间切换、背离、Failure Swing |
| 3 | [与 ICT 结合](./03-with-ict.md) | RSI 在 ICT 框架里能做什么、不能做什么 |

## 学习方法

1. **先学读法，再谈信号**。RSI 最有价值的用法是判断趋势状态（区间切换）和动能衰竭（背离），而不是机械地「70 卖、30 买」。
2. **固定参数**。统一用 14 周期、同一个数据源，避免看到不顺眼就换参数。
3. **用日志验证**。用到 RSI 的交易在 `tags` 里加 `rsi`（如 `tags: [rsi, rsi-divergence]`），积累样本后在仪表盘按标签对比。
