interface Props {
  label: string
  value: string
  hint?: string
  tone?: string
  title?: string
}

export default function Kpi({ label, value, hint, tone = '', title }: Props) {
  return (
    <div className="kpi" title={title}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone}`}>{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  )
}
