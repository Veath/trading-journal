# FRVP 学习路线

FRVP（Fixed Range Volume Profile，固定区间成交量分布）是 TradingView 等平台的 Volume Profile 工具：**手动选定一段 K 线区间，把这段时间的成交量按价格统计**，画成横向柱状图。

> K 线显示「什么时候成交了多少」，Volume Profile 显示「在什么价格成交了多少」。成交密集的价格是市场接受的价值区，成交稀少的价格是被快速穿过、被拒绝的区域。

## 建议学习顺序

| # | 主题 | 解决的问题 |
|---|---|---|
| 1 | [核心概念](./01-concepts.md) | POC、Value Area、HVN / LVN、分布形态 |
| 2 | [用法与 ICT 结合](./02-usage.md) | 区间怎么选？和 FVG、流动性、Premium / Discount 怎么配合？ |

## 学习方法

1. **区间选择比读图更重要**。同一段行情，选的起点终点不同，POC 和价值区会完全不同。先学会「选什么区间」。
2. **配合 [VWAP](../vwap/00-overview.md)**。VWAP 是平均成本，FRVP 是成本分布，两者互相印证。
3. **用日志验证**。用到 FRVP 的交易在 `tags` 里标记（如 `tags: [frvp-lvn]`），并在截图里保留 profile。
