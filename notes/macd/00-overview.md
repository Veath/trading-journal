# MACD 学习路线

MACD（Moving Average Convergence Divergence，指数平滑异同移动平均线）由 Gerald Appel 在 1970 年代提出，用 **两条 EMA 的差值** 衡量趋势动能，再用这个差值的 EMA 做信号线。

> MACD 和 [RSI](../rsi/00-overview.md) 一样描述 **动能**，但它不是有界指标：数值大小取决于品种价格和波动，不能跨品种比较。

## 建议学习顺序

| # | 主题 | 解决的问题 |
|---|---|---|
| 1 | [计算与组成](./01-calculation.md) | MACD 线、Signal、柱状图分别是什么？ |
| 2 | [信号与读法](./02-signals.md) | 0 轴、金叉死叉、柱状图、背离 |
| 3 | [与 ICT 结合](./03-with-ict.md) | MACD 在 ICT 框架里能做什么、不能做什么 |

## 学习方法

1. **固定默认参数 (12, 26, 9)**，和 [EMA](../ema/00-overview.md) 一样不随手改。
2. **重点看柱状图和背离**，不要把金叉死叉当成入场信号。
3. **用日志验证**。用到 MACD 的交易在 `tags` 里标记（如 `tags: [macd-divergence]`），积累样本后对比。
