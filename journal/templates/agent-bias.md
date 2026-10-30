---
date: {{date}}
time:                    # 分析时间 HH:mm
tz: "+08:00"
watch:
  - symbol:              # Binance 代码，如 CLUSDT
    bias:                # bullish / bearish / neutral
    status: watching     # watching / triggered / invalidated / expired
    setup:
    reason:              # 为什么值得关注
    trigger:             # 等什么条件
    invalidation:        # 什么情况放弃
    entryZone:           # 计划进场区：{ top: 101, bottom: 100, label: 回踩区 }
    entry:               # 示例价格，用于估算 R；条件未出现时可以不填
    stop:
    targets: []
    levels: []           # 关键点位：- { price: 100, label: 等低, kind: key }
---

这里是 Agent 的看法和建议，不是交易指令。
