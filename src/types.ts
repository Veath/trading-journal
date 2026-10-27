/**
 * 交易日志数据模型。
 *
 * 每笔交易是 journal/trades/ 下的一个 Markdown 文件：
 *   - YAML frontmatter = 结构化字段（用于统计）
 *   - 正文 = 计划 / 执行 / 复盘 / 教训（用于回顾）
 *
 * 所有统计以 R 倍数为核心单位（1R = 入场到止损的风险），
 * 这样仓位大小、品种、点值不同的交易也能直接比较。
 */

export type Direction = 'long' | 'short'

/** closed = 已平仓；open = 持仓中；missed = 符合计划但没做（错过的机会） */
export type TradeStatus = 'closed' | 'open' | 'missed'

export type Outcome = 'win' | 'loss' | 'breakeven'

/** 策略体系，可自行扩展 */
export type Strategy = 'ICT' | '自然交易理论' | 'RSI' | (string & {})

/** 交易质量评级：A+ 为教科书级 setup */
export type Grade = 'A+' | 'A' | 'B' | 'C'

/** 情绪记录（交易前 / 中 / 后），用自由标签，例如 calm / FOMO / anxious / greedy / revenge */
export interface Emotions {
  before?: string
  during?: string
  after?: string
}

/** Markdown frontmatter 中书写的原始字段 */
export interface TradeFrontmatter {
  date: string // YYYY-MM-DD
  time?: string // HH:mm（交易所时间，ICT 一般用纽约时间）
  symbol: string
  direction: Direction
  status?: TradeStatus // 默认 closed

  // —— 策略 / 背景 ——
  strategy: Strategy
  setup?: string // Silver Bullet / 2022 Model / OTE / Turtle Soup / Unicorn ...
  session?: string // Asia / London / NY AM / NY PM（Killzone）
  timeframe?: string // 入场周期
  htfBias?: 'bullish' | 'bearish' | 'neutral'
  biasCorrect?: boolean // 事后看 HTF bias 是否判断正确
  drawOnLiquidity?: string // DOL：目标流动性，如 PDH / 周高 / EQH
  liquiditySweep?: string // 入场前扫掉的流动性，如 Asia Low / SSL
  pdArrays?: string[] // FVG / OB / Breaker / BPR / IFVG ...

  // —— 价格 ——
  entry?: number
  stop?: number
  target?: number
  exit?: number
  /** 手动指定实际 R（分批止盈、移动止损等无法用 exit 算出时使用），优先级最高 */
  r?: number
  size?: number // 手数 / 合约数
  pnl?: number // 账户货币盈亏（已扣手续费），可选
  fees?: number

  // —— 心理 & 执行（Trade Psychology & Effective Journaling） ——
  grade?: Grade
  followedPlan?: boolean // 是否完全按计划执行
  confidence?: number // 1-5
  emotions?: Emotions
  mistakes?: string[] // FOMO / moved-stop / early-exit / revenge / oversize / no-setup / chased ...

  tags?: string[]
  screenshots?: string[]
}

/** 解析 + 计算后的交易 */
export interface Trade extends TradeFrontmatter {
  id: string // 文件名（不含扩展名）
  status: TradeStatus
  body: string // Markdown 正文
  /** 实际 R 倍数；无法计算时为 null */
  rMultiple: number | null
  /** 计划 R:R（target 距离 / stop 距离） */
  plannedRR: number | null
  outcome: Outcome | null
  weekday: number // 0=周日
}

/** 每日日志（盘前计划 + 盘后复盘），journal/days/YYYY-MM-DD.md */
export interface DayEntryFrontmatter {
  date: string
  mood?: number // 1-5 盘前状态
  sleep?: number // 睡眠小时
  dailyBias?: 'bullish' | 'bearish' | 'neutral'
  news?: string[] // 当日重要数据
  maxTrades?: number // 计划最多交易笔数
  maxLossR?: number // 当日最大亏损（R）
  rulesFollowed?: boolean // 盘后：今天是否守住纪律
  tags?: string[]
}

export interface DayEntry extends DayEntryFrontmatter {
  id: string
  body: string
}
