---
date: {{date}}
time: "09:50"            # 纽约时间
symbol: NQ
direction: long          # long / short
status: closed           # closed / open / missed（符合计划但没做）

# —— ICT 背景 ——
strategy: ICT            # ICT / 自然交易理论 / RSI ...
setup: Silver Bullet     # Silver Bullet / 2022 Model / OTE / Turtle Soup / Unicorn / Breaker ...
session: NY AM           # Asia / London / NY AM / NY Lunch / NY PM
timeframe: 1m
htfBias: bullish         # bullish / bearish / neutral
biasCorrect:             # 事后填：bias 是否正确 true / false
drawOnLiquidity: PDH     # DOL
liquiditySweep: London Low
pdArrays: [FVG]          # FVG / OB / Breaker / BPR / IFVG / Mitigation ...

# —— 价格（R 自动计算；分批止盈时直接填 r） ——
entry:
stop:
target:
exit:
# r: 1.5
size: 1
pnl:                     # 账户盈亏（扣费后），可选

# —— 心理 & 执行 ——
grade: A                 # A+ / A / B / C
followedPlan: true
confidence: 4            # 1-5
emotions:
  before: calm
  during:
  after:
mistakes: []             # FOMO / moved-stop / early-exit / revenge / oversize / no-setup / chased
tags: []
screenshots: []          # 放到 journal/screenshots/ 下，这里写文件名
---

## 交易前：计划
- HTF 叙事 / Bias：
- 目标流动性（DOL）：
- 入场模型与触发条件：
- 失效条件：

## 交易中：执行
- 实际入场是否符合计划：
- 持仓中的想法和情绪：

## 交易后：复盘
- 做对了什么：
- 做错了什么：
- 如果重来一次：

## 一句话教训
>
