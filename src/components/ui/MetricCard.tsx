type MetricCardProps = { label: string; value: string; helper: string; trend?: 'positive' | 'warning' | 'neutral' }
export function MetricCard({ label, value, helper, trend = 'neutral' }: MetricCardProps) { return <article className="metric-card"><p>{label}</p><strong>{value}</strong><span className={`metric-card__helper metric-card__helper--${trend}`}>{helper}</span></article> }
