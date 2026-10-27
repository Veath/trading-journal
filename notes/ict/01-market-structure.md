# 市场结构

## 摆动点（Swing High / Low）

- **Swing High**：一根 K 线的高点高于左右两侧相邻 K 线的高点（三根 K 线结构）。
- **Swing Low**：一根 K 线的低点低于左右两侧相邻 K 线的低点。
- 按重要性分为：
  - **STH / STL**（短期高低点）：普通摆动点
  - **ITH / ITL**（中期高低点）：两侧都有更低 / 更高的短期点
  - **LTH / LTL**（长期高低点）：两侧都有更低 / 更高的中期点

结构判断时，**中期高低点** 通常比短期高低点更有参考价值。

## BOS 与 MSS

| 概念 | 定义 | 含义 |
|---|---|---|
| **BOS**（Break of Structure） | 顺势突破前一个摆动点 | 趋势延续 |
| **MSS**（Market Structure Shift） | 逆势突破最近的短期摆动点，**且伴随位移（displacement）** | 短期方向可能转变 |

一个高质量的 MSS 通常满足：

1. 先扫掉一侧流动性（例如跌破 Asia Low）
2. 然后出现 **位移**：连续、实体饱满的 K 线快速反向，留下 FVG
3. 位移收盘突破最近的短期摆动点

> 没有扫流动性、没有位移的「突破」，更可能是噪音或诱导（inducement）。

![市场结构：BOS 与 MSS](./img/market-structure.svg)

## 位移（Displacement）

- 强势、单方向、实体大、影线短的一根或一组 K 线
- 是「聪明钱真正入场」的证据，**几乎总会留下 FVG**
- 位移的起点常成为 Order Block，位移中留下的 FVG 是回撤入场点

## 内部 / 外部区间流动性

- **ERL**（External Range Liquidity）：区间外的高点 / 低点 —— 止损单聚集处
- **IRL**（Internal Range Liquidity）：区间内的 FVG 等低效区
- 价格大体在两者之间交替：**从 ERL 到 IRL，从 IRL 到 ERL**。
  - 刚扫完外部高点 → 下一个目标往往是区间内的 FVG
  - 刚回补完 FVG → 下一个目标往往是外部高低点

## 复盘问题

- 入场时，入场周期上是否有清晰的 MSS？`htfBias` 方向与 MSS 方向一致吗？
- 我是不是把普通的回撤当成了结构转变？
