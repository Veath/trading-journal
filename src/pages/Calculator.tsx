import { useEffect, useMemo, useState } from 'react'
import {
  calculatePosition,
  CUSTOM_INSTRUMENT,
  EXNESS_INSTRUMENTS,
  formatLot,
  formatPrice,
  type InstrumentSpec,
  type QuoteMode,
  type RiskMode,
  type StopMode,
} from '../lib/calc'
import Select from '../components/Select'

const STORAGE_KEY = 'tj-calc-v1'
const BINANCE_TICKER_API = 'https://fapi.binance.com/fapi/v1/ticker/price'

const QUICK_RISK_USD = [25, 50, 100, 200, 500]
const QUICK_RISK_PCT = [0.5, 1, 1.5, 2]
const QUICK_LEVERAGE = [100, 200, 500, 1000, 2000]
const QUICK_INSTRUMENTS = EXNESS_INSTRUMENTS.filter((i) => i.group === 'quick')
const MORE_INSTRUMENTS = [...EXNESS_INSTRUMENTS.filter((i) => i.group !== 'quick'), CUSTOM_INSTRUMENT]

interface SpecOverride {
  contractSize?: number
  minLot?: number
  lotStep?: number
  quoteMode?: QuoteMode
  quoteCurrency?: string
}

interface PersistedState {
  symbolId: string
  centAccount: boolean
  riskMode: RiskMode
  riskUsd: string
  balanceUsd: string
  riskPct: string
  stopMode: StopMode
  leverage: string
  quotePerUsd: string
  overrides: Record<string, SpecOverride>
}

const DEFAULT_STATE: PersistedState = {
  symbolId: 'XAUUSD',
  centAccount: false,
  riskMode: 'usd',
  riskUsd: '100',
  balanceUsd: '5000',
  riskPct: '1',
  stopMode: 'price',
  leverage: '200',
  quotePerUsd: '155',
  overrides: {},
}

function loadState(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      ...DEFAULT_STATE,
      ...parsed,
      overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
    }
  } catch {
    return DEFAULT_STATE
  }
}

function parseNum(s: string): number | null {
  const cleaned = s.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function fmtUsd(x: number | null | undefined, signed = false): string {
  if (x == null || !Number.isFinite(x)) return '—'
  const abs = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (!signed) return `$${abs}`
  if (x > 0) return `+$${abs}`
  if (x < 0) return `-$${abs}`
  return `$${abs}`
}

function fmtCompactQty(qty: number | null | undefined): string {
  if (qty == null || !Number.isFinite(qty)) return '—'
  if (qty === 0) return '0'
  if (Math.abs(qty) >= 100) return qty.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (Math.abs(qty) >= 1) return qty.toLocaleString('en-US', { maximumFractionDigits: 3 })
  return qty.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 局域网 HTTP 等环境下退回 execCommand
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export default function Calculator() {
  const [saved, setSaved] = useState<PersistedState>(loadState)
  const [entryStr, setEntryStr] = useState('')
  const [stopStr, setStopStr] = useState('')
  const [targetStr, setTargetStr] = useState('')
  const [distStr, setDistStr] = useState('')
  const [showSpecs, setShowSpecs] = useState(false)
  const [specDraft, setSpecDraft] = useState<{ contractSize?: string; minLot?: string; lotStep?: string }>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceHint, setPriceHint] = useState<string | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // 隐私模式或空间满时静默忽略
    }
  }, [saved])

  const patch = (next: Partial<PersistedState>) => setSaved((prev) => ({ ...prev, ...next }))

  const baseSpec: InstrumentSpec = useMemo(() => {
    return (
      EXNESS_INSTRUMENTS.find((i) => i.id === saved.symbolId) ??
      (saved.symbolId === CUSTOM_INSTRUMENT.id ? CUSTOM_INSTRUMENT : EXNESS_INSTRUMENTS[0])
    )
  }, [saved.symbolId])

  const override = saved.overrides[baseSpec.id]
  const spec: InstrumentSpec = useMemo(
    () => ({
      ...baseSpec,
      contractSize: override?.contractSize ?? baseSpec.contractSize,
      minLot: override?.minLot ?? baseSpec.minLot,
      lotStep: override?.lotStep ?? baseSpec.lotStep,
      quoteMode: override?.quoteMode ?? baseSpec.quoteMode,
      quoteCurrency: override?.quoteCurrency ?? baseSpec.quoteCurrency,
    }),
    [baseSpec, override],
  )

  const hasOverride = Boolean(
    override &&
      (override.contractSize != null ||
        override.minLot != null ||
        override.lotStep != null ||
        override.quoteMode != null),
  )

  const selectSymbol = (id: string) => {
    if (id === saved.symbolId) return
    patch({ symbolId: id })
    // 切换品种时清空旧价格，避免拿黄金价格误算原油手数
    setEntryStr('')
    setStopStr('')
    setTargetStr('')
    setDistStr('')
    setSpecDraft({})
    setPriceHint(null)
    if (id === CUSTOM_INSTRUMENT.id) setShowSpecs(true)
  }

  const updateOverride = (field: keyof SpecOverride, value: number | QuoteMode | undefined) => {
    setSaved((prev) => {
      const curr = prev.overrides[baseSpec.id] ?? {}
      const nextCurr = { ...curr, [field]: value }
      return {
        ...prev,
        overrides: { ...prev.overrides, [baseSpec.id]: nextCurr },
      }
    })
  }

  const resetOverride = () => {
    setSpecDraft({})
    setSaved((prev) => {
      const next = { ...prev.overrides }
      delete next[baseSpec.id]
      return { ...prev, overrides: next }
    })
  }

  const entryNum = parseNum(entryStr)
  const stopNum = parseNum(stopStr)
  const targetNum = parseNum(targetStr)
  const distNum = parseNum(distStr)

  const result = useMemo(
    () =>
      calculatePosition({
        spec,
        centAccount: saved.centAccount,
        riskMode: saved.riskMode,
        riskUsd: parseNum(saved.riskUsd),
        balanceUsd: parseNum(saved.balanceUsd),
        riskPct: parseNum(saved.riskPct),
        stopMode: saved.stopMode,
        entry: entryNum,
        stop: stopNum,
        stopDistanceInput: distNum,
        target: targetNum,
        leverage: parseNum(saved.leverage),
        quotePerUsd: parseNum(saved.quotePerUsd),
      }),
    [spec, saved, entryNum, stopNum, distNum, targetNum],
  )

  const triggerCopy = async (key: string, value: string) => {
    const ok = await copyText(value)
    if (!ok) return
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr))
    }, 1500)
  }

  const fetchBinancePrice = async () => {
    if (!spec.binanceSymbol || priceLoading) return
    setPriceLoading(true)
    setPriceHint(null)
    try {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(`${BINANCE_TICKER_API}?symbol=${encodeURIComponent(spec.binanceSymbol)}`, {
        signal: ctrl.signal,
      })
      window.clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { price?: string }
      const p = Number(data.price)
      if (!Number.isFinite(p) || p <= 0) throw new Error('无效价格')
      setEntryStr(p.toFixed(spec.priceDecimals))
      setPriceHint(`已填入币安 ${spec.binanceSymbol} 现价（与 Exness 可能有微小价差）`)
    } catch {
      setPriceHint('拉取币安现价失败，请直接手动输入 MT5 报价')
    } finally {
      setPriceLoading(false)
    }
  }

  const fillTargetByR = (r: number) => {
    if (entryNum == null || stopNum == null || entryNum === stopNum) return
    const dist = Math.abs(entryNum - stopNum)
    const sign = entryNum > stopNum ? 1 : -1
    const price = entryNum + sign * dist * r
    if (price > 0) setTargetStr(formatPrice(price, spec.priceDecimals))
  }

  const swapEntryStop = () => {
    setEntryStr(stopStr)
    setStopStr(entryStr)
  }

  const needsQuoteRate =
    spec.quoteMode === 'QUOTE_FX' || (spec.quoteMode === 'USD_BASE' && saved.stopMode === 'distance')

  const isQuickSelected = QUICK_INSTRUMENTS.some((i) => i.id === saved.symbolId)
  const moreOptions = [
    { value: '__more__', label: '更多品种 / 外汇…' },
    ...MORE_INSTRUMENTS.map((i) => ({
      value: i.id,
      label: i.id === CUSTOM_INSTRUMENT.id ? '自定义规格' : `${i.symbol} · ${i.name}`,
    })),
  ]

  const recLotText = result.valid && !result.belowMinLot ? formatLot(result.recommendedLot, spec.lotStep) : null
  const ceilLotText = result.valid ? formatLot(result.lotCeil, spec.lotStep) : null
  const lotUnit = saved.centAccount ? '美分手' : 'Lot'

  const effectiveBalance = parseNum(saved.balanceUsd)
  const effectiveRiskPct = parseNum(saved.riskPct)
  const pctRiskPreview =
    saved.riskMode === 'pct' && effectiveBalance != null && effectiveRiskPct != null
      ? (effectiveBalance * effectiveRiskPct) / 100
      : null

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <b>Position Sizing</b> / Exness · MT5 · 以损定仓
          </p>
          <h1 className="display">
            以损定仓，<em>快算手数。</em>
          </h1>
        </div>
        <p className="sub">按最大可接受亏损与止损位置，直接算出 MT5 下单 Lot，并换算为熟悉的币安数量与名义仓位。</p>
      </header>

      <div className="calc-grid">
        {/* 左侧：输入区 */}
        <section className="card calc-inputs">
          {/* 01 品种 */}
          <div className="calc-section">
            <div className="calc-section-head">
              <p className="eyebrow">
                <b>01</b> / 品种 · Exness
              </p>
              <Select
                label="更多 Exness 品种"
                value={isQuickSelected ? '__more__' : saved.symbolId}
                options={moreOptions}
                onChange={(v) => {
                  if (v !== '__more__') selectSymbol(v)
                }}
              />
            </div>

            <div className="calc-symbol-grid" role="group" aria-label="常用 Exness 品种">
              {QUICK_INSTRUMENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`calc-sym-btn ${saved.symbolId === item.id ? 'on' : ''}`}
                  onClick={() => selectSymbol(item.id)}
                >
                  <span className="calc-sym-code">{item.symbol}</span>
                  <span className="calc-sym-name">{item.name}</span>
                </button>
              ))}
            </div>

            <div className="calc-spec-bar">
              <div className="calc-spec-meta">
                <span>
                  1 {lotUnit} ={' '}
                  <b>
                    {fmtCompactQty(result.effectiveContractSize)} {spec.unitLabel}
                  </b>
                </span>
                <span>最小 {spec.minLot}</span>
                <span>步长 {spec.lotStep}</span>
                {saved.centAccount && <span className="calc-badge-gold">美分 ÷100</span>}
                {hasOverride && <span className="calc-badge-gold">已微调</span>}
              </div>
              <button type="button" className="calc-link-btn" onClick={() => setShowSpecs((v) => !v)}>
                {showSpecs ? '收起规格 ▴' : '微调规格 ▾'}
              </button>
            </div>
            {spec.binanceNote && <p className="calc-note">{spec.binanceNote}</p>}

            {showSpecs && (
              <div className="calc-spec-drawer">
                <div className="calc-spec-row">
                  <span className="calc-field-label">账户类型</span>
                  <div className="segmented" role="group" aria-label="Exness 账户类型">
                    <button
                      type="button"
                      className={!saved.centAccount ? 'on' : ''}
                      onClick={() => patch({ centAccount: false })}
                    >
                      标准 / Pro / Raw
                    </button>
                    <button
                      type="button"
                      className={saved.centAccount ? 'on' : ''}
                      onClick={() => patch({ centAccount: true })}
                    >
                      美分 Cent (÷100)
                    </button>
                  </div>
                </div>

                <div className="calc-inline-3">
                  <label className="calc-field">
                    <span className="calc-field-label">标准合约大小</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={specDraft.contractSize ?? String(spec.contractSize)}
                      onChange={(e) => {
                        const raw = e.target.value
                        setSpecDraft((d) => ({ ...d, contractSize: raw }))
                        const n = parseNum(raw)
                        if (n != null && n > 0) updateOverride('contractSize', n)
                      }}
                      onBlur={() => setSpecDraft((d) => ({ ...d, contractSize: undefined }))}
                    />
                  </label>
                  <label className="calc-field">
                    <span className="calc-field-label">最小手数</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={specDraft.minLot ?? String(spec.minLot)}
                      onChange={(e) => {
                        const raw = e.target.value
                        setSpecDraft((d) => ({ ...d, minLot: raw }))
                        const n = parseNum(raw)
                        if (n != null && n > 0) updateOverride('minLot', n)
                      }}
                      onBlur={() => setSpecDraft((d) => ({ ...d, minLot: undefined }))}
                    />
                  </label>
                  <label className="calc-field">
                    <span className="calc-field-label">手数步长</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={specDraft.lotStep ?? String(spec.lotStep)}
                      onChange={(e) => {
                        const raw = e.target.value
                        setSpecDraft((d) => ({ ...d, lotStep: raw }))
                        const n = parseNum(raw)
                        if (n != null && n > 0) updateOverride('lotStep', n)
                      }}
                      onBlur={() => setSpecDraft((d) => ({ ...d, lotStep: undefined }))}
                    />
                  </label>
                </div>

                {baseSpec.id === CUSTOM_INSTRUMENT.id && (
                  <div className="calc-spec-row">
                    <span className="calc-field-label">计价方式</span>
                    <div className="segmented">
                      {(
                        [
                          ['USD', 'USD 计价'],
                          ['USD_BASE', 'USD 基础货币'],
                          ['QUOTE_FX', '非 USD 计价'],
                        ] as [QuoteMode, string][]
                      ).map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          className={spec.quoteMode === m ? 'on' : ''}
                          onClick={() => updateOverride('quoteMode', m)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="calc-field">
                  <div className="calc-field-top">
                    <span className="calc-field-label">杠杆（仅用于估算保证金）</span>
                    <span className="muted num-v">1:{saved.leverage || '—'}</span>
                  </div>
                  <div className="calc-chips">
                    {QUICK_LEVERAGE.map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        className={`calc-chip ${saved.leverage === String(lv) ? 'on' : ''}`}
                        onClick={() => patch({ leverage: String(lv) })}
                      >
                        1:{lv}
                      </button>
                    ))}
                  </div>
                </div>

                {hasOverride && (
                  <button type="button" className="calc-link-btn" onClick={resetOverride}>
                    恢复 {baseSpec.symbol} 默认规格
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 02 风险预算 */}
          <div className="calc-section">
            <div className="calc-section-head">
              <p className="eyebrow">
                <b>02</b> / 风险预算 (1R)
              </p>
              <div className="segmented" role="group" aria-label="风险输入方式">
                <button
                  type="button"
                  className={saved.riskMode === 'usd' ? 'on' : ''}
                  onClick={() => patch({ riskMode: 'usd' })}
                >
                  固定金额 $
                </button>
                <button
                  type="button"
                  className={saved.riskMode === 'pct' ? 'on' : ''}
                  onClick={() => patch({ riskMode: 'pct' })}
                >
                  账户比例 %
                </button>
              </div>
            </div>

            {saved.riskMode === 'usd' ? (
              <div className="calc-fields-stack">
                <div className="calc-inline-2">
                  <label className="calc-field">
                    <span className="calc-field-label">单笔最大亏损 ($)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="例如 100"
                      value={saved.riskUsd}
                      onChange={(e) => patch({ riskUsd: e.target.value })}
                    />
                  </label>
                  <label className="calc-field">
                    <span className="calc-field-label">账户余额 ($, 可选)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="用于算风控占比"
                      value={saved.balanceUsd}
                      onChange={(e) => patch({ balanceUsd: e.target.value })}
                    />
                  </label>
                </div>
                <div className="calc-chips">
                  {QUICK_RISK_USD.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`calc-chip ${saved.riskUsd === String(v) ? 'on' : ''}`}
                      onClick={() => patch({ riskUsd: String(v) })}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="calc-fields-stack">
                <div className="calc-inline-2">
                  <label className="calc-field">
                    <span className="calc-field-label">账户余额 ($)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="例如 5000"
                      value={saved.balanceUsd}
                      onChange={(e) => patch({ balanceUsd: e.target.value })}
                    />
                  </label>
                  <label className="calc-field">
                    <div className="calc-field-top">
                      <span className="calc-field-label">单笔风险 (%)</span>
                      {pctRiskPreview != null && <span className="calc-inline-hint">= {fmtUsd(pctRiskPreview)}</span>}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="例如 1"
                      value={saved.riskPct}
                      onChange={(e) => patch({ riskPct: e.target.value })}
                    />
                  </label>
                </div>
                <div className="calc-chips">
                  {QUICK_RISK_PCT.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`calc-chip ${saved.riskPct === String(v) ? 'on' : ''}`}
                      onClick={() => patch({ riskPct: String(v) })}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 03 价位与止损 */}
          <div className="calc-section">
            <div className="calc-section-head">
              <p className="eyebrow">
                <b>03</b> / 价位与止损
              </p>
              <div className="segmented" role="group" aria-label="止损输入方式">
                <button
                  type="button"
                  className={saved.stopMode === 'price' ? 'on' : ''}
                  onClick={() => patch({ stopMode: 'price' })}
                >
                  入场 / 止损价
                </button>
                <button
                  type="button"
                  className={saved.stopMode === 'distance' ? 'on' : ''}
                  onClick={() => patch({ stopMode: 'distance' })}
                >
                  按止损距离
                </button>
              </div>
            </div>

            {saved.stopMode === 'price' ? (
              <div className="calc-fields-stack">
                <div className="calc-inline-2">
                  <label className="calc-field">
                    <div className="calc-field-top">
                      <span className="calc-field-label">入场价 Entry</span>
                      {spec.binanceSymbol && (
                        <button
                          type="button"
                          className="calc-link-btn"
                          onClick={fetchBinancePrice}
                          disabled={priceLoading}
                        >
                          {priceLoading ? '获取中…' : '取币安现价'}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="MT5 入场价"
                      value={entryStr}
                      onChange={(e) => setEntryStr(e.target.value)}
                    />
                  </label>

                  <label className="calc-field">
                    <div className="calc-field-top">
                      <span className="calc-field-label">止损价 Stop Loss</span>
                      {(entryStr || stopStr) && (
                        <button type="button" className="calc-link-btn" onClick={swapEntryStop} title="互换入场价与止损价">
                          ⇅ 互换
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="止损价位"
                      value={stopStr}
                      onChange={(e) => setStopStr(e.target.value)}
                    />
                  </label>
                </div>

                {priceHint && <p className="calc-note">{priceHint}</p>}

                <div className="calc-field">
                  <div className="calc-field-top">
                    <span className="calc-field-label">目标价 Target（可选）</span>
                    <div className="calc-r-quick">
                      {[1.5, 2, 3].map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="calc-chip sm"
                          disabled={entryNum == null || stopNum == null || entryNum === stopNum}
                          onClick={() => fillTargetByR(r)}
                        >
                          +{r}R
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="选填，计算计划 R:R 与预期盈利"
                    value={targetStr}
                    onChange={(e) => setTargetStr(e.target.value)}
                  />
                  {result.targetInvalid && (
                    <p className="calc-field-err">
                      目标价方向与当前{result.direction === 'long' ? '做多' : '做空'}相反，请检查价格
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="calc-fields-stack">
                <div className="calc-inline-2">
                  <label className="calc-field">
                    <span className="calc-field-label">
                      {spec.pipSize ? `止损点数 (Pips, 1 pip = ${spec.pipSize})` : '止损价差（价格单位）'}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={spec.pipSize ? '例如 15' : spec.id === 'XAUUSD' ? '例如 12' : '输入价差'}
                      value={distStr}
                      onChange={(e) => setDistStr(e.target.value)}
                    />
                  </label>
                  <label className="calc-field">
                    <div className="calc-field-top">
                      <span className="calc-field-label">参考入场价（可选）</span>
                      {spec.binanceSymbol && (
                        <button
                          type="button"
                          className="calc-link-btn"
                          onClick={fetchBinancePrice}
                          disabled={priceLoading}
                        >
                          {priceLoading ? '获取中…' : '取现价'}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="用于算仓位价值与保证金"
                      value={entryStr}
                      onChange={(e) => setEntryStr(e.target.value)}
                    />
                  </label>
                </div>
                {priceHint && <p className="calc-note">{priceHint}</p>}
              </div>
            )}

            {needsQuoteRate && (
              <label className="calc-field calc-rate-field">
                <span className="calc-field-label">
                  折算汇率：1 USD = ? {spec.quoteCurrency ?? '计价货币'}（用于换算美元盈亏）
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="例如 155"
                  value={saved.quotePerUsd}
                  onChange={(e) => patch({ quotePerUsd: e.target.value })}
                />
              </label>
            )}
          </div>
        </section>

        {/* 右侧：计算结果区 */}
        <section className="card calc-result" aria-live="polite">
          <div className="calc-res-head">
            <div>
              <p className="eyebrow">
                <b>MT5 Order</b> / {spec.symbol} · {spec.name}
              </p>
              <div className="calc-res-tags">
                {result.direction && (
                  <span className={`dir ${result.direction}`}>{result.direction === 'long' ? '多 LONG' : '空 SHORT'}</span>
                )}
                {result.valid && result.stopDistance != null && (
                  <span className="calc-dist-pill">
                    止损距离{' '}
                    {result.stopPips != null
                      ? `${result.stopPips.toFixed(1)} pips`
                      : formatPrice(result.stopDistance, spec.priceDecimals)}
                    {result.stopDistancePct != null ? ` (${result.stopDistancePct.toFixed(2)}%)` : ''}
                  </span>
                )}
              </div>
            </div>
            {result.valid && result.rawLot != null && (
              <span className="calc-raw-lot" title="未按步长取整的精确理论手数">
                理论 {result.rawLot.toFixed(4)}
              </span>
            )}
          </div>

          {!result.valid ? (
            <div className="calc-placeholder">
              <div className="calc-big-lot muted">—</div>
              <p className="sub">{result.error ?? '输入风险预算与止损价位即可实时算出 MT5 手数'}</p>
            </div>
          ) : (
            <>
              {/* 主手数显示 + 一键复制 */}
              <div className="calc-hero">
                <div className="calc-hero-num">
                  <span className={`calc-big-lot ${result.belowMinLot ? 'neg' : ''}`}>
                    {result.belowMinLot ? formatLot(0, spec.lotStep) : recLotText}
                  </span>
                  <span className="calc-big-unit">{lotUnit}</span>
                </div>
                {recLotText && (
                  <button
                    type="button"
                    className={`calc-copy-btn ${copiedKey === 'main' ? 'copied' : ''}`}
                    onClick={() => triggerCopy('main', recLotText)}
                  >
                    {copiedKey === 'main' ? '已复制 ✓' : `复制 ${recLotText}`}
                  </button>
                )}
              </div>

              {/* 低于最小手数警告 */}
              {result.belowMinLot && (
                <div className="calc-warn">
                  <b>低于 Exness 最小下单量（{spec.minLot} 手）</b>
                  <p>
                    按当前止损，理论仅需 <code>{result.rawLot?.toFixed(4)}</code> 手。若强行下最小手数{' '}
                    <code>{spec.minLot}</code>，触发止损将亏损 <b className="neg">{fmtUsd(-(result.minLotRiskUsd ?? 0), true)}</b>
                    （超出目标风险{' '}
                    <b className="neg">
                      +{(((result.minLotRiskUsd ?? 0) - (result.targetRiskUsd ?? 1)) / (result.targetRiskUsd ?? 1) * 100).toFixed(0)}%
                    </b>
                    ）。建议收窄止损、提高风险预算，或改用美分账户。
                  </p>
                </div>
              )}

              {/* 保守（向下取整）vs 进取（向上取整）对照 */}
              <div className="calc-compare">
                <button
                  type="button"
                  className={`calc-cmp-box ${!result.belowMinLot ? 'primary' : ''}`}
                  disabled={!recLotText}
                  onClick={() => recLotText && triggerCopy('floor', recLotText)}
                >
                  <span className="calc-cmp-label">
                    向下取整 · 严控风险 {copiedKey === 'floor' && <em className="pos">已复制</em>}
                  </span>
                  <span className="calc-cmp-lot">
                    {formatLot(result.lotFloor, spec.lotStep)} <small>{lotUnit}</small>
                  </span>
                  <span className="calc-cmp-risk">
                    实亏 <b className="neg">{fmtUsd(-(result.actualRiskFloorUsd ?? 0), true)}</b>
                    {result.riskDiffFloorPct != null && (
                      <span className="muted">
                        {' '}
                        ({result.riskDiffFloorPct >= 0 ? '+' : ''}
                        {result.riskDiffFloorPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  className="calc-cmp-box"
                  disabled={!ceilLotText}
                  onClick={() => ceilLotText && triggerCopy('ceil', ceilLotText)}
                >
                  <span className="calc-cmp-label">
                    {result.belowMinLot ? '最小手数参考' : '向上取整 · 进取对照'}{' '}
                    {copiedKey === 'ceil' && <em className="pos">已复制</em>}
                  </span>
                  <span className="calc-cmp-lot">
                    {ceilLotText} <small>{lotUnit}</small>
                  </span>
                  <span className="calc-cmp-risk">
                    实亏 <b className="neg">{fmtUsd(-(result.actualRiskCeilUsd ?? 0), true)}</b>
                    {result.riskDiffCeilPct != null && (
                      <span className="muted">
                        {' '}
                        ({result.riskDiffCeilPct >= 0 ? '+' : ''}
                        {result.riskDiffCeilPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </button>
              </div>

              {/* 币安视角对照 KPI */}
              <div className="calc-bridge">
                <p className="eyebrow">
                  <b>Binance View</b> / 币安合约视角换算
                </p>
                <div className="kpis compact">
                  <div className="kpi">
                    <div className="kpi-label">实际持仓数量</div>
                    <div className="kpi-value">
                      {fmtCompactQty(result.qtyFloor)} <span className="calc-kpi-unit">{spec.unitLabel}</span>
                    </div>
                    <div className="kpi-hint">
                      1 {lotUnit} = {fmtCompactQty(result.effectiveContractSize)} {spec.unitLabel}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label">实际止损金额</div>
                    <div className="kpi-value neg">
                      {result.belowMinLot ? '—' : fmtUsd(-(result.actualRiskFloorUsd ?? 0), true)}
                    </div>
                    <div className="kpi-hint">
                      {result.actualRiskFloorPct != null
                        ? `占账户 ${result.actualRiskFloorPct.toFixed(2)}%`
                        : `目标 ${fmtUsd(-(result.targetRiskUsd ?? 0), true)}`}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label">名义仓位价值</div>
                    <div className="kpi-value">{result.notionalUsd != null ? fmtUsd(result.notionalUsd) : '—'}</div>
                    <div className="kpi-hint">{result.notionalUsd != null ? '等价币安开仓价值' : '填入入场价后显示'}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label">预估保证金</div>
                    <div className="kpi-value">{result.estMarginUsd != null ? fmtUsd(result.estMarginUsd) : '—'}</div>
                    <div className="kpi-hint">
                      {result.estMarginUsd != null ? `按 1:${saved.leverage} 静态估算` : 'Exness 实盘为阶梯杠杆'}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label">每变动 {result.valueStepLabel}</div>
                    <div className="kpi-value">{fmtUsd(result.valuePerStepUsd)}</div>
                    <div className="kpi-hint">每 1 手止损 {fmtUsd(result.lossPerLotUsd)}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label">分批止盈拆分</div>
                    <div className="kpi-value">
                      {result.splitHalf
                        ? `${formatLot(result.splitHalf[0], spec.lotStep)} + ${formatLot(result.splitHalf[1], spec.lotStep)}`
                        : '不可拆'}
                    </div>
                    <div className="kpi-hint">
                      {result.splitHalf ? 'MT5 可分两笔部分平仓' : `需 ≥ ${formatLot(spec.minLot * 2, spec.lotStep)} 手`}
                    </div>
                  </div>
                </div>
              </div>

              {/* 风险回报梯（填了有效目标价时） */}
              {result.plannedRR != null && entryNum != null && stopNum != null && targetNum != null && (
                <div className="calc-ladder-wrap">
                  <div className="calc-ladder-head">
                    <span className="eyebrow">
                      <b>Planned R:R</b> / +{result.plannedRR.toFixed(2)}R
                    </span>
                    <span className="pos num-v">预计盈利 {fmtUsd(result.targetProfitUsd, true)}</span>
                  </div>
                  <div className="ladder">
                    <div className="ladder-bar" aria-hidden="true">
                      <i className="risk" style={{ flex: 1 }} />
                      <i className="reward" style={{ flex: result.plannedRR }} />
                    </div>
                    <div className="ladder-labels">
                      <span style={{ flex: 1 }}>止损 {formatPrice(stopNum, spec.priceDecimals)}</span>
                      <span style={{ flex: result.plannedRR }}>
                        入场 {formatPrice(entryNum, spec.priceDecimals)}
                        <span>目标 {formatPrice(targetNum, spec.priceDecimals)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 多 R 目标速查（点击价格直接复制进 MT5 止盈栏） */}
              {result.rLevels.length > 0 && (
                <div className="calc-r-table">
                  <p className="eyebrow">
                    <b>Take Profit</b> / 多 R 目标价（点击复制）
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>盈亏比</th>
                          <th className="num">目标价 TP</th>
                          <th className="num">预计盈利</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rLevels.map((lv) => {
                          const priceText = formatPrice(lv.price, spec.priceDecimals)
                          const key = `tp-${lv.label}`
                          return (
                            <tr
                              key={lv.label}
                              className={`clickable ${lv.isCustom ? 'calc-custom-row' : ''}`}
                              onClick={() => triggerCopy(key, priceText)}
                            >
                              <td>
                                <span className="num-v">{lv.label}</span>
                                {copiedKey === key && <span className="calc-copied-inline">已复制</span>}
                              </td>
                              <td className="num">{priceText}</td>
                              <td className="num pos">{fmtUsd(lv.profitUsd, true)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* 底部：Exness ↔ 币安合约规格速查表 */}
      <section className="card">
        <p className="eyebrow">
          <b>Reference</b> / Exness ↔ Binance 规格速查
        </p>
        <h2>
          常见品种，<em>手数对照。</em>
        </h2>
        <p className="sub">点击任意一行可快速切换上方品种。首次在 Exness 交易新品种前，建议在 MT5 品种「规格」确认后缀与合约大小。</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exness 代码</th>
                <th>品种</th>
                <th className="num">1 标准手</th>
                <th className="num">最小手数</th>
                <th>币安视角对照</th>
              </tr>
            </thead>
            <tbody>
              {EXNESS_INSTRUMENTS.map((item) => (
                <tr
                  key={item.id}
                  className={`clickable ${item.id === saved.symbolId ? 'calc-active-row' : ''}`}
                  onClick={() => {
                    selectSymbol(item.id)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  <td className="symbol">{item.symbol}</td>
                  <td>{item.name}</td>
                  <td className="num">
                    {item.contractSize.toLocaleString('en-US')} {item.unitLabel}
                  </td>
                  <td className="num">{formatLot(item.minLot, item.lotStep)}</td>
                  <td className="muted">{item.binanceNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
