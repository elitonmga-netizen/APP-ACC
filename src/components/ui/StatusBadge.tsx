import type { EntityStatus } from '../../models/operational'
export function StatusBadge({ status }: { status: EntityStatus }) { return <span className={`status-badge status-badge--${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span> }
