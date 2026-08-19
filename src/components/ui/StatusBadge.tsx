import type { ServiceOrder } from '../../types/dashboard'
export function StatusBadge({ status }: { status: ServiceOrder['status'] }) { return <span className={`status-badge status-badge--${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span> }
