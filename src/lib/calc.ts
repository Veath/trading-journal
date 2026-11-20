/**
 * Exness / MT5 以损定仓（手数）计算引擎
 *
 * 核心公式：
 *   1) USD 计价（金属 / 原油 / 美股指 / 加密 / XXXUSD 直盘）：
 *        每 1 手止损亏损 = 合约大小 × 止损价差
 *        理论手数 = 目标风险($) / (合约大小 × 止损价差)
 *   2) USD 为基础货币（USDJPY / USDCAD / USDCHF）：
 *        止损时按止损价（平仓汇率）折算为 USD：
 *        每 1 手止损亏损 = 合约大小 × 止损价差 / 止损价
 *   3) 非 USD 计价（如 JP225 / EURJPY，计价货币为 JPY 等）：
 *        每 1 手止损亏损 = 合约大小 × 止损价差 / (1 USD 兑计价货币汇率)
 *
 * 规格以 Exness 标准 / Pro / Raw / Zero 账户为准（美分账户开启 centMode 后自动 ÷100）。
 * 实际下单前仍建议在 MT5 品种「规格」中核对账户对应的合约大小与最小手数。
 */

export type QuoteMode = 'USD' | 'USD_BASE' | 'QUOTE_FX'

export type InstrumentGroup = 'quick' | 'crypto' | 'index' | 'fx'

export interface InstrumentSpec {
  id: string
  symbol: string
  name: string
  group: InstrumentGroup
  /** 1 标准手对应的标的单位数 */
  contractSize: number
  /** 标的单位中文名（用于币安视角换算，如 oz / 桶 / BTC） */
  unitLabel: string
  /** 最小下单手数 */
  minLot: number
  /** 手数步长 */
  lotStep: number
  /** 价格常用小数位 */
  priceDecimals: number
  /** 计价模式 */
  quoteMode: QuoteMode
  /** QUOTE_FX 时的计价货币代码 */
  quoteCurrency?: string
  /** QUOTE_FX 时的默认汇率（1 USD = ? quoteCurrency） */
  defaultQuotePerUsd?: number
  /** 外汇的 1 pip 对应价格变动（用于显示点数与按点数输入） */
  pipSize?: number
  /** 对应的币安 USDT 永续代码（可选，用于拉取参考现价） */
  binanceSymbol?: string
  /** 币安对照说明 */
  binanceNote?: string
}

export const EXNESS_INSTRUMENTS: InstrumentSpec[] = [
  // 常用品种（一键切换）
  {
    id: 'XAUUSD',
    symbol: 'XAUUSD',
    name: '黄金',
    group: 'quick',
    contractSize: 100,
    unitLabel: 'oz',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 2,
    quoteMode: 'USD',
    binanceSymbol: 'XAUUSDT',
    binanceNote: '0.01 手 = 1 oz（等于币安 XAUUSDT 数量 1）',
  },
  {
    id: 'XAGUSD',
    symbol: 'XAGUSD',
    name: '白银',
    group: 'quick',
    contractSize: 5000,
    unitLabel: 'oz',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 3,
    quoteMode: 'USD',
    binanceSymbol: 'XAGUSDT',
    binanceNote: '0.01 手 = 50 oz（注意单手较大）',
  },
  {
    id: 'USOIL',
    symbol: 'USOIL',
    name: '美原油',
    group: 'quick',
    contractSize: 1000,
    unitLabel: '桶',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 2,
    quoteMode: 'USD',
    binanceSymbol: 'CLUSDT',
    binanceNote: '0.01 手 = 10 桶（等于币安 CLUSDT 数量 10）',
  },
  {
    id: 'USTEC',
    symbol: 'USTEC',
    name: '纳指 100',
    group: 'quick',
    contractSize: 1,
    unitLabel: '合约',
    minLot: 0.05,
    lotStep: 0.01,
    priceDecimals: 1,
    quoteMode: 'USD',
    binanceNote: '1 手 = 1 指数点 = $1/点；标准版最小 0.05 手',
  },
  {
    id: 'US500',
    symbol: 'US500',
    name: '标普 500',
    group: 'quick',
    contractSize: 1,
    unitLabel: '合约',
    minLot: 0.14,
    lotStep: 0.01,
    priceDecimals: 1,
    quoteMode: 'USD',
    binanceNote: '1 手 = 1 指数点 = $1/点；标准版最小 0.14 手',
  },
  {
    id: 'BTCUSD',
    symbol: 'BTCUSD',
    name: '比特币',
    group: 'quick',
    contractSize: 1,
    unitLabel: 'BTC',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 1,
    quoteMode: 'USD',
    binanceSymbol: 'BTCUSDT',
    binanceNote: '1 手 = 1 BTC（与币安数量 1:1 相同）',
  },

  // 更多加密
  {
    id: 'ETHUSD',
    symbol: 'ETHUSD',
    name: '以太坊',
    group: 'crypto',
    contractSize: 1,
    unitLabel: 'ETH',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 2,
    quoteMode: 'USD',
    binanceSymbol: 'ETHUSDT',
    binanceNote: '1 手 = 1 ETH（与币安数量 1:1 相同）',
  },
  {
    id: 'SOLUSD',
    symbol: 'SOLUSD',
    name: 'Solana',
    group: 'crypto',
    contractSize: 10,
    unitLabel: 'SOL',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 2,
    quoteMode: 'USD',
    binanceSymbol: 'SOLUSDT',
    binanceNote: '1 手 = 10 SOL（0.01 手 = 0.1 SOL）',
  },

  // 更多股指
  {
    id: 'US30',
    symbol: 'US30',
    name: '道琼斯',
    group: 'index',
    contractSize: 1,
    unitLabel: '合约',
    minLot: 0.05,
    lotStep: 0.01,
    priceDecimals: 1,
    quoteMode: 'USD',
    binanceNote: '1 手 = 1 指数点 = $1/点；标准版最小 0.05 手',
  },
  {
    id: 'JP225',
    symbol: 'JP225',
    name: '日经 225',
    group: 'index',
    contractSize: 1,
    unitLabel: '合约',
    minLot: 3,
    lotStep: 0.01,
    priceDecimals: 0,
    quoteMode: 'QUOTE_FX',
    quoteCurrency: 'JPY',
    defaultQuotePerUsd: 155,
    binanceNote: '日元计价，1 手每点 = ¥1；标准版最小 3.00 手',
  },

  // 外汇
  {
    id: 'EURUSD',
    symbol: 'EURUSD',
    name: '欧元/美元',
    group: 'fx',
    contractSize: 100000,
    unitLabel: 'EUR',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 5,
    quoteMode: 'USD',
    pipSize: 0.0001,
    binanceNote: '1 标准手 = 100,000 EUR，每 pip = $10',
  },
  {
    id: 'GBPUSD',
    symbol: 'GBPUSD',
    name: '英镑/美元',
    group: 'fx',
    contractSize: 100000,
    unitLabel: 'GBP',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 5,
    quoteMode: 'USD',
    pipSize: 0.0001,
    binanceNote: '1 标准手 = 100,000 GBP，每 pip = $10',
  },
  {
    id: 'AUDUSD',
    symbol: 'AUDUSD',
    name: '澳元/美元',
    group: 'fx',
    contractSize: 100000,
    unitLabel: 'AUD',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 5,
    quoteMode: 'USD',
    pipSize: 0.0001,
    binanceNote: '1 标准手 = 100,000 AUD，每 pip = $10',
  },
  {
    id: 'USDJPY',
    symbol: 'USDJPY',
    name: '美元/日元',
    group: 'fx',
    contractSize: 100000,
    unitLabel: 'USD',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 3,
    quoteMode: 'USD_BASE',
    quoteCurrency: 'JPY',
    defaultQuotePerUsd: 155,
    pipSize: 0.01,
    binanceNote: '1 标准手 = $100,000，盈亏按平仓汇率折算 USD',
  },
  {
    id: 'GBPJPY',
    symbol: 'GBPJPY',
    name: '英镑/日元',
    group: 'fx',
    contractSize: 100000,
    unitLabel: 'GBP',
    minLot: 0.01,
    lotStep: 0.01,
    priceDecimals: 3,
    quoteMode: 'QUOTE_FX',
    quoteCurrency: 'JPY',
    defaultQuotePerUsd: 155,
    pipSize: 0.01,
    binanceNote: '日元交叉盘，按 USDJPY 汇率折算 USD',
  },
]

export const CUSTOM_INSTRUMENT: InstrumentSpec = {
  id: 'CUSTOM',
  symbol: 'CUSTOM',
  name: '自定义品种',
  group: 'fx',
  contractSize: 100,
  unitLabel: '单位',
  minLot: 0.01,
  lotStep: 0.01,
  priceDecimals: 2,
  quoteMode: 'USD',
}

export type RiskMode = 'usd' | 'pct'
export type StopMode = 'price' | 'distance'

export interface CalcInput {
  spec: InstrumentSpec
  /** 是否为 Exness 美分账户（1 美分手 = 0.01 标准手，风险仍按 USD 输入） */
  centAccount?: boolean
  riskMode: RiskMode
  /** 固定风险金额 (USD) */
  riskUsd?: number | null
  /** 账户余额 (USD)，比例模式必填，固定金额模式可选（用于计算占账户百分比） */
  balanceUsd?: number | null
  /** 账户风险百分比，如 1 表示 1% */
  riskPct?: number | null
  stopMode: StopMode
  /** 入场价（按价位模式必填；按距离模式可选，用于估算仓位价值与保证金） */
  entry?: number | null
  /** 止损价（按价位模式必填） */
  stop?: number | null
  /** 止损距离（按距离模式必填；外汇品种单位为 pips，其他为价格单位） */
  stopDistanceInput?: number | null
  /** 目标价（可选，仅按价位模式生效） */
  target?: number | null
  /** 杠杆倍数（用于估算所需保证金，如 200 表示 1:200） */
  leverage?: number | null
  /** 计价货币汇率（1 USD = ? quoteCurrency），用于 QUOTE_FX 以及距离模式的 USD_BASE */
  quotePerUsd?: number | null
}

export interface RLevel {
  r: number
  label: string
  price: number
  profitUsd: number
  isCustom?: boolean
}

export interface CalcResult {
  valid: boolean
  error?: string
  direction: 'long' | 'short' | null
  /** 生效合约大小（开启美分账户时为 contractSize / 100） */
  effectiveContractSize: number
  /** 目标风险金额 (USD) */
  targetRiskUsd: number | null
  /** 目标风险占账户百分比 (0-100) */
  targetRiskPct: number | null
  /** 止损价差（始终为价格单位） */
  stopDistance: number | null
  /** 止损距离占入场价百分比 (0-100) */
  stopDistancePct: number | null
  /** 止损点数（外汇品种有值） */
  stopPips: number | null
  /** 每 1 手触及止损的亏损 (USD) */
  lossPerLotUsd: number | null
  /** 未取整的理论手数 */
  rawLot: number | null
  /** 向下取整到步长的手数（保守，严格不超过目标风险） */
  lotFloor: number | null
  /** 向上取整到步长的手数（进取对照） */
  lotCeil: number | null
  /** 推荐下单手数（低于 minLot 时为 0） */
  recommendedLot: number | null
  /** 理论手数是否低于最小下单手数 */
  belowMinLot: boolean
  /** 若强行下 minLot 的实际止损亏损 (USD) */
  minLotRiskUsd: number | null
  /** 向下取整手数的实际止损亏损 (USD) */
  actualRiskFloorUsd: number | null
  /** 向下取整手数实际风险占账户百分比 (0-100) */
  actualRiskFloorPct: number | null
  /** 向下取整手数相对目标风险的偏差百分比（负值表示低于目标） */
  riskDiffFloorPct: number | null
  /** 向上取整手数的实际止损亏损 (USD) */
  actualRiskCeilUsd: number | null
  /** 向上取整手数相对目标风险的偏差百分比（正值表示超出目标） */
  riskDiffCeilPct: number | null
  /** 币安视角：推荐手数对应的实际持仓数量（oz / 桶 / BTC 等） */
  qtyFloor: number | null
  /** 币安视角：名义仓位价值 (USD) */
  notionalUsd: number | null
  /** 预估保证金 (USD) */
  estMarginUsd: number | null
  /** 价格每变动 1 单位（外汇为 1 pip）的盈亏 (USD) */
  valuePerStepUsd: number | null
  /** 单位标签（如 "$1" 或 "1 pip"） */
  valueStepLabel: string
  /** 计划盈亏比（填了有效目标价时） */
  plannedRR: number | null
  /** 目标价是否方向填反 */
  targetInvalid: boolean
  /** 触及目标价的预估盈利 (USD，按向下取整手数) */
  targetProfitUsd: number | null
  /** 1R / 1.5R / 2R / 3R 目标速查（有入场与止损价时） */
  rLevels: RLevel[]
  /** 50/50 分批止盈建议手数（若可拆分） */
  splitHalf: [number, number] | null
}

/** 获取步长的小数位数（如 0.01 -> 2, 0.1 -> 1, 1 -> 0） */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2
  const s = step.toString()
  if (s.includes('e-')) return Number(s.split('e-')[1]) || 2
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

/** 消除浮点误差后格式化手数 */
export function formatLot(lot: number | null | undefined, step = 0.01): string {
  if (lot == null || !Number.isFinite(lot)) return '—'
  return lot.toFixed(stepDecimals(step))
}

/** 格式化价格 */
export function formatPrice(price: number | null | undefined, decimals = 2): string {
  if (price == null || !Number.isFinite(price)) return '—'
  return price.toFixed(decimals)
}

function roundToStep(value: number, step: number, mode: 'floor' | 'ceil'): number {
  const decimals = stepDecimals(step)
  const eps = 1e-9
  const steps = mode === 'floor' ? Math.floor(value / step + eps) : Math.ceil(value / step - eps)
  return Number((Math.max(0, steps) * step).toFixed(decimals))
}

function emptyResult(spec: InstrumentSpec, effectiveContractSize: number, error?: string): CalcResult {
  return {
    valid: false,
    error,
    direction: null,
    effectiveContractSize,
    targetRiskUsd: null,
    targetRiskPct: null,
    stopDistance: null,
    stopDistancePct: null,
    stopPips: null,
    lossPerLotUsd: null,
    rawLot: null,
    lotFloor: null,
    lotCeil: null,
    recommendedLot: null,
    belowMinLot: false,
    minLotRiskUsd: null,
    actualRiskFloorUsd: null,
    actualRiskFloorPct: null,
    riskDiffFloorPct: null,
    actualRiskCeilUsd: null,
    riskDiffCeilPct: null,
    qtyFloor: null,
    notionalUsd: null,
    estMarginUsd: null,
    valuePerStepUsd: null,
    valueStepLabel: spec.pipSize ? '1 pip' : '1 点',
    plannedRR: null,
    targetInvalid: false,
    targetProfitUsd: null,
    rLevels: [],
    splitHalf: null,
  }
}

export function calculatePosition(input: CalcInput): CalcResult {
  const { spec, centAccount = false, riskMode, stopMode } = input
  const contractSize = spec.contractSize
  const minLot = spec.minLot > 0 ? spec.minLot : 0.01
  const lotStep = spec.lotStep > 0 ? spec.lotStep : 0.01
  const effectiveContractSize = centAccount ? contractSize / 100 : contractSize

  if (!(effectiveContractSize > 0)) {
    return emptyResult(spec, effectiveContractSize, '合约大小必须大于 0')
  }

  // 1. 计算目标风险金额 (USD)
  const balance = input.balanceUsd != null && input.balanceUsd > 0 ? input.balanceUsd : null
  let targetRiskUsd: number | null = null
  if (riskMode === 'usd') {
    if (input.riskUsd != null && input.riskUsd > 0) targetRiskUsd = input.riskUsd
  } else {
    if (balance != null && input.riskPct != null && input.riskPct > 0) {
      targetRiskUsd = (balance * input.riskPct) / 100
    }
  }

  if (targetRiskUsd == null || !(targetRiskUsd > 0)) {
    return emptyResult(spec, effectiveContractSize, riskMode === 'usd' ? '请输入单笔最大亏损金额' : '请输入账户余额和风险比例')
  }

  const targetRiskPct = balance != null ? (targetRiskUsd / balance) * 100 : null

  // 2. 计算止损距离与方向
  let direction: 'long' | 'short' | null = null
  let stopDistance: number | null = null
  const entry = input.entry != null && input.entry > 0 ? input.entry : null
  const stop = input.stop != null && input.stop > 0 ? input.stop : null

  if (stopMode === 'price') {
    if (entry == null || stop == null) {
      return emptyResult(spec, effectiveContractSize, '请输入入场价和止损价')
    }
    if (entry === stop) {
      return emptyResult(spec, effectiveContractSize, '入场价与止损价不能相同')
    }
    direction = entry > stop ? 'long' : 'short'
    stopDistance = Math.abs(entry - stop)
  } else {
    const rawDist = input.stopDistanceInput
    if (rawDist == null || !(rawDist > 0)) {
      return emptyResult(spec, effectiveContractSize, spec.pipSize ? '请输入止损点数 (Pips)' : '请输入止损价差')
    }
    stopDistance = spec.pipSize ? rawDist * spec.pipSize : rawDist
  }

  const stopDistancePct = entry != null ? (stopDistance / entry) * 100 : null
  const stopPips = spec.pipSize ? stopDistance / spec.pipSize : null

  // 3. 确定折算汇率（计价货币 -> USD）
  let quoteDivisor = 1
  if (spec.quoteMode === 'USD_BASE') {
    // 止损平仓时按止损价折算为 USD；距离模式下使用入场价或参考汇率
    const conv = stop ?? entry ?? input.quotePerUsd ?? spec.defaultQuotePerUsd
    if (conv == null || !(conv > 0)) {
      return emptyResult(spec, effectiveContractSize, '需要有效的汇率或止损价以折算 USD')
    }
    quoteDivisor = conv
  } else if (spec.quoteMode === 'QUOTE_FX') {
    const conv = input.quotePerUsd ?? spec.defaultQuotePerUsd
    if (conv == null || !(conv > 0)) {
      return emptyResult(spec, effectiveContractSize, `请输入 USD/${spec.quoteCurrency ?? '计价货币'} 汇率`)
    }
    quoteDivisor = conv
  }

  // 4. 计算每 1 手止损亏损与手数
  const lossPerLotUsd = (effectiveContractSize * stopDistance) / quoteDivisor
  if (!(lossPerLotUsd > 0) || !Number.isFinite(lossPerLotUsd)) {
    return emptyResult(spec, effectiveContractSize, '参数异常，无法计算手数')
  }

  const rawLot = targetRiskUsd / lossPerLotUsd
  const lotFloor = roundToStep(rawLot, lotStep, 'floor')
  const lotCeil = Math.max(minLot, roundToStep(rawLot, lotStep, 'ceil'))
  const belowMinLot = lotFloor < minLot - 1e-9
  const recommendedLot = belowMinLot ? 0 : lotFloor

  const minLotRiskUsd = minLot * lossPerLotUsd
  const actualRiskFloorUsd = lotFloor * lossPerLotUsd
  const actualRiskFloorPct = balance != null ? (actualRiskFloorUsd / balance) * 100 : null
  const riskDiffFloorPct = ((actualRiskFloorUsd - targetRiskUsd) / targetRiskUsd) * 100

  const actualRiskCeilUsd = lotCeil * lossPerLotUsd
  const riskDiffCeilPct = ((actualRiskCeilUsd - targetRiskUsd) / targetRiskUsd) * 100

  // 5. 币安视角换算（基于推荐手数，低于最小手数时按 0 显示）
  const activeLot = recommendedLot
  const qtyFloor = activeLot * effectiveContractSize

  let notionalUsd: number | null = null
  if (spec.quoteMode === 'USD_BASE') {
    // 如 USDJPY：1 手本身就是 $100,000（无需乘以价格）
    notionalUsd = activeLot * effectiveContractSize
  } else if (entry != null) {
    notionalUsd = (activeLot * effectiveContractSize * entry) / quoteDivisor
  }

  const leverage = input.leverage != null && input.leverage > 0 ? input.leverage : null
  const estMarginUsd = notionalUsd != null && leverage != null ? notionalUsd / leverage : null

  const unitMove = spec.pipSize ?? 1
  const valueStepLabel = spec.pipSize ? '1 pip' : spec.group === 'index' ? '1 指数点' : '$1 波动'
  const refDivisorForUnit = spec.quoteMode === 'USD_BASE' ? (entry ?? quoteDivisor) : quoteDivisor
  const valuePerStepUsd = (activeLot * effectiveContractSize * unitMove) / refDivisorForUnit

  // 6. 目标价与多 R 速查
  let plannedRR: number | null = null
  let targetInvalid = false
  let targetProfitUsd: number | null = null
  const rLevels: RLevel[] = []

  const calcProfitAtPrice = (price: number): number => {
    if (entry == null) return 0
    const dist = Math.abs(price - entry)
    const div = spec.quoteMode === 'USD_BASE' ? price : quoteDivisor
    return (activeLot * effectiveContractSize * dist) / div
  }

  if (stopMode === 'price' && entry != null && direction != null) {
    const sign = direction === 'long' ? 1 : -1

    if (input.target != null && input.target > 0) {
      const rewardSigned = (input.target - entry) * sign
      if (rewardSigned <= 0) {
        targetInvalid = true
      } else {
        plannedRR = rewardSigned / stopDistance
        targetProfitUsd = calcProfitAtPrice(input.target)
      }
    }

    for (const r of [1, 1.5, 2, 3]) {
      const price = entry + sign * stopDistance * r
      if (price > 0) {
        rLevels.push({
          r,
          label: `${r}R`,
          price,
          profitUsd: calcProfitAtPrice(price),
        })
      }
    }

    if (plannedRR != null && input.target != null && !rLevels.some((lv) => Math.abs(lv.r - plannedRR!) < 0.05)) {
      rLevels.push({
        r: plannedRR,
        label: `目标 ${plannedRR.toFixed(1)}R`,
        price: input.target,
        profitUsd: targetProfitUsd ?? 0,
        isCustom: true,
      })
      rLevels.sort((a, b) => a.r - b.r)
    }
  }

  // 7. 分批止盈建议（将推荐手数拆为两笔均符合 minLot 和 lotStep 的手数）
  let splitHalf: [number, number] | null = null
  if (!belowMinLot && recommendedLot >= minLot * 2 - 1e-9) {
    const decimals = stepDecimals(lotStep)
    const halfCeil = roundToStep(recommendedLot / 2, lotStep, 'ceil')
    const other = Number((recommendedLot - halfCeil).toFixed(decimals))
    if (other >= minLot - 1e-9 && halfCeil >= minLot - 1e-9) {
      splitHalf = [halfCeil, other]
    }
  }

  return {
    valid: true,
    direction,
    effectiveContractSize,
    targetRiskUsd,
    targetRiskPct,
    stopDistance,
    stopDistancePct,
    stopPips,
    lossPerLotUsd,
    rawLot,
    lotFloor,
    lotCeil,
    recommendedLot,
    belowMinLot,
    minLotRiskUsd,
    actualRiskFloorUsd,
    actualRiskFloorPct,
    riskDiffFloorPct,
    actualRiskCeilUsd,
    riskDiffCeilPct,
    qtyFloor,
    notionalUsd,
    estMarginUsd,
    valuePerStepUsd,
    valueStepLabel,
    plannedRR,
    targetInvalid,
    targetProfitUsd,
    rLevels,
    splitHalf,
  }
}
