/**
 * Exness / MT5 通用以损定仓（手数）计算引擎
 *
 * 不绑定固定品种清单，只需填入 MT5 品种「规格」中的合约大小（Contract Size）即可适用于任意品种：
 *   1) USD 计价（金属 / 原油 / 美股 / 美股指 / 加密 / XXXUSD 直盘）：
 *        每 1 手止损亏损 = 合约大小 × 止损价差
 *        理论手数 = 目标风险($) / (合约大小 × 止损价差)
 *   2) USD 为基础货币（如 USDJPY / USDCAD / USDCHF）：
 *        止损平仓时按止损价（平仓汇率）折算为 USD：
 *        每 1 手止损亏损 = 合约大小 × 止损价差 / 止损价
 *   3) 非 USD 计价（如日元计价 JP225 / EURJPY、欧元计价 DE30 等）：
 *        每 1 手止损亏损 = 合约大小 × 止损价差 / (1 USD 兑计价货币汇率)
 */

export type QuoteMode = 'USD' | 'USD_BASE' | 'QUOTE_FX'
export type RiskMode = 'usd' | 'pct'
export type StopMode = 'price' | 'distance'

export interface CalcInput {
  /** 1 标准手对应的标的单位数（对应 MT5 品种详情里的「合约大小 / Contract size」） */
  contractSize: number
  /** 最小下单手数，默认 0.01 */
  minLot?: number
  /** 手数步长，默认 0.01 */
  lotStep?: number
  /** 计价方式，默认 USD */
  quoteMode?: QuoteMode
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
  /** 入场价（按价位模式必填；按价差模式可选，用于估算名义仓位与保证金） */
  entry?: number | null
  /** 止损价（按价位模式必填） */
  stop?: number | null
  /** 止损价差（价格单位，按价差模式必填） */
  stopDistanceInput?: number | null
  /** 目标价（可选，仅按价位模式生效） */
  target?: number | null
  /** 杠杆倍数（用于估算所需保证金，如 200 表示 1:200） */
  leverage?: number | null
  /** 计价货币汇率（1 USD = ? 计价货币），用于 QUOTE_FX 以及价差模式的 USD_BASE */
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
  /** 止损价差（价格单位） */
  stopDistance: number | null
  /** 止损价差占入场价百分比 (0-100) */
  stopDistancePct: number | null
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
  /** 币安视角：推荐手数对应的实际持仓数量（= 手数 × 生效合约大小） */
  qtyFloor: number | null
  /** 币安视角：名义仓位价值 (USD) */
  notionalUsd: number | null
  /** 预估保证金 (USD) */
  estMarginUsd: number | null
  /** 价格每变动一个参考步长（1 / 0.01 / 0.0001）的盈亏 (USD) */
  valuePerStepUsd: number | null
  /** 参考步长标签 */
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

/** 常见合约大小快捷档位（仅供参考，输入框可填任意数值） */
export const CONTRACT_SIZE_PRESETS: { size: number; label: string; hint: string }[] = [
  { size: 1, label: '1', hint: '股指 / BTC / ETH' },
  { size: 10, label: '10', hint: 'SOL 等部分币种' },
  { size: 100, label: '100', hint: '黄金 / 常见美股' },
  { size: 1000, label: '1,000', hint: '原油 / 大宗' },
  { size: 5000, label: '5,000', hint: '白银' },
  { size: 100000, label: '100,000', hint: '标准外汇' },
]

/** 获取步长的小数位数（如 0.01 -> 2, 0.1 -> 1, 1 -> 0） */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2
  const s = step.toString()
  if (s.includes('e-')) return Number(s.split('e-')[1]) || 2
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

/** 根据用户输入的价位字符串自动推断合适的小数位数 */
export function inferPriceDecimals(...rawInputs: string[]): number {
  let maxDec = 0
  for (const raw of rawInputs) {
    const cleaned = raw.replace(/,/g, '').trim()
    const dot = cleaned.indexOf('.')
    if (dot !== -1) {
      maxDec = Math.max(maxDec, cleaned.length - dot - 1)
    }
  }
  return Math.min(6, Math.max(2, maxDec))
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

function emptyResult(effectiveContractSize: number, error?: string): CalcResult {
  return {
    valid: false,
    error,
    direction: null,
    effectiveContractSize,
    targetRiskUsd: null,
    targetRiskPct: null,
    stopDistance: null,
    stopDistancePct: null,
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
    valueStepLabel: '1 点',
    plannedRR: null,
    targetInvalid: false,
    targetProfitUsd: null,
    rLevels: [],
    splitHalf: null,
  }
}

export function calculatePosition(input: CalcInput): CalcResult {
  const { contractSize, centAccount = false, riskMode, stopMode } = input
  const quoteMode: QuoteMode = input.quoteMode ?? 'USD'
  const minLot = input.minLot != null && input.minLot > 0 ? input.minLot : 0.01
  const lotStep = input.lotStep != null && input.lotStep > 0 ? input.lotStep : 0.01
  const effectiveContractSize = centAccount ? contractSize / 100 : contractSize

  if (!(effectiveContractSize > 0) || !Number.isFinite(effectiveContractSize)) {
    return emptyResult(0, '请输入有效的合约大小（MT5 品种规格中的 Contract size）')
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
    return emptyResult(effectiveContractSize, riskMode === 'usd' ? '请输入单笔最大亏损金额' : '请输入账户余额和风险比例')
  }

  const targetRiskPct = balance != null ? (targetRiskUsd / balance) * 100 : null

  // 2. 计算止损价差与方向
  let direction: 'long' | 'short' | null = null
  let stopDistance: number | null = null
  const entry = input.entry != null && input.entry > 0 ? input.entry : null
  const stop = input.stop != null && input.stop > 0 ? input.stop : null

  if (stopMode === 'price') {
    if (entry == null || stop == null) {
      return emptyResult(effectiveContractSize, '请输入入场价和止损价')
    }
    if (entry === stop) {
      return emptyResult(effectiveContractSize, '入场价与止损价不能相同')
    }
    direction = entry > stop ? 'long' : 'short'
    stopDistance = Math.abs(entry - stop)
  } else {
    const rawDist = input.stopDistanceInput
    if (rawDist == null || !(rawDist > 0)) {
      return emptyResult(effectiveContractSize, '请输入止损价差')
    }
    stopDistance = rawDist
  }

  const stopDistancePct = entry != null ? (stopDistance / entry) * 100 : null

  // 3. 确定折算汇率（计价货币 -> USD）
  let quoteDivisor = 1
  if (quoteMode === 'USD_BASE') {
    const conv = stop ?? entry ?? input.quotePerUsd
    if (conv == null || !(conv > 0)) {
      return emptyResult(effectiveContractSize, 'USD 基础货币品种需填写止损价或折算汇率')
    }
    quoteDivisor = conv
  } else if (quoteMode === 'QUOTE_FX') {
    const conv = input.quotePerUsd
    if (conv == null || !(conv > 0)) {
      return emptyResult(effectiveContractSize, '非 USD 计价品种需填写 1 USD 兑计价货币的汇率')
    }
    quoteDivisor = conv
  }

  // 4. 计算每 1 手止损亏损与手数
  const lossPerLotUsd = (effectiveContractSize * stopDistance) / quoteDivisor
  if (!(lossPerLotUsd > 0) || !Number.isFinite(lossPerLotUsd)) {
    return emptyResult(effectiveContractSize, '参数异常，无法计算手数')
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

  // 5. 币安视角换算
  const activeLot = recommendedLot
  const qtyFloor = activeLot * effectiveContractSize

  let notionalUsd: number | null = null
  if (quoteMode === 'USD_BASE') {
    notionalUsd = activeLot * effectiveContractSize
  } else if (entry != null) {
    notionalUsd = (activeLot * effectiveContractSize * entry) / quoteDivisor
  }

  const leverage = input.leverage != null && input.leverage > 0 ? input.leverage : null
  const estMarginUsd = notionalUsd != null && leverage != null ? notionalUsd / leverage : null

  // 按量级自动选择直观的价格变动单位（外汇 0.0001 / 日元系 0.01 / 其他 1）
  let unitMove = 1
  let valueStepLabel = '1 价格单位'
  if (contractSize >= 10000) {
    if (entry != null && entry >= 10) {
      unitMove = 0.01
      valueStepLabel = '0.01 (1 pip)'
    } else if (stopDistance < 0.1) {
      unitMove = 0.0001
      valueStepLabel = '0.0001 (1 pip)'
    } else {
      unitMove = 0.01
      valueStepLabel = '0.01 (1 pip)'
    }
  }
  const refDivisorForUnit = quoteMode === 'USD_BASE' ? (entry ?? quoteDivisor) : quoteDivisor
  const valuePerStepUsd = (activeLot * effectiveContractSize * unitMove) / refDivisorForUnit

  // 6. 目标价与多 R 速查
  let plannedRR: number | null = null
  let targetInvalid = false
  let targetProfitUsd: number | null = null
  const rLevels: RLevel[] = []

  const calcProfitAtPrice = (price: number): number => {
    if (entry == null) return 0
    const dist = Math.abs(price - entry)
    const div = quoteMode === 'USD_BASE' ? price : quoteDivisor
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

  // 7. 分批止盈建议
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
