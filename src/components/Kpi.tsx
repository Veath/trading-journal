interface Props {
  label: string
  value: string
  hint?: string
  tone?: string
  title?: string
  /** 0–1 的进度条；mark 为参考线位置（如保本胜率） */
  meter?: { value: number; mark?: number | null; tone?: string }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export default function Kpi({ label, value, hint, tone = '', title, meter }: Props) {
  return (
    <div className="kpi" title={title}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone}`}>{value}</div>
      {meter && (
        <div className="meter" aria-hidden="true">
          <i className={meter.tone === 'neg' ? 'neg-bg' : 'pos-bg'} style={{ width: `${clamp01(meter.value) * 100}%` }} />
          {meter.mark != null && <b style={{ left: `${clamp01(meter.mark) * 100}%` }} />}
        </div>
      )}
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  )
}
