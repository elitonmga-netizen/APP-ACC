import { useEffect, useState } from 'react'
import type { MaintenanceItem, ServiceOrder } from '../../models/operational'
import { requestOnline } from '../../services/http'
import { TechnicalReportModal } from './TechnicalReportModal'
import { StatusBadge } from '../ui/StatusBadge'
import { Pagination } from '../ui/Pagination'

type History = { orders: (ServiceOrder & { hasReport: boolean })[]; maintenance: MaintenanceItem[]; total: number; limit: number }
export function EquipmentHistory({ equipmentId }: { equipmentId: string }) {
  const [data, setData] = useState<History | null>(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [report, setReport] = useState<ServiceOrder | null>(null)
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    let cancelled = false
    setData(null); setError('')
    requestOnline<History>(`equipment/${encodeURIComponent(equipmentId)}/history?page=${page}`).then(value => { if (!cancelled) setData(value) }).catch(cause => { if (!cancelled) setError(cause instanceof TypeError ? 'Conecte-se para consultar o histórico.' : cause instanceof Error ? cause.message : 'Não foi possível consultar o histórico.') })
    return () => { cancelled = true }
  }, [equipmentId, page, revision])
  const open = async (order: ServiceOrder) => {
    setOpening(true); setError('')
    try { setReport(await requestOnline<ServiceOrder>(`service-orders/${encodeURIComponent(order.id)}`)) }
    catch (cause) { setError((cause as Error).message) }
    finally { setOpening(false) }
  }
  return <section className="equipment-history" aria-label="Histórico do equipamento">
    <h3>Histórico do equipamento</h3>
    <p>Atendimentos, relatórios, medições e fotos. A consulta do histórico completo requer conexão.</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Carregando histórico…</p>}
    {error && <button className="secondary-button" type="button" onClick={() => setRevision(value => value + 1)}>Atualizar histórico</button>}
    {data && <>
      <p>{data.total} atendimento(s) · {data.maintenance.filter(item => item.schedule).length} preventiva(s) programada(s)</p>
      {!data.orders.length && <p>Nenhum atendimento registrado.</p>}
      {data.orders.map(order => <article className="history-order" key={order.id}>
        <div><strong>{order.code}</strong> <StatusBadge status={order.status} /></div>
        <p>{order.description}</p>
        <small>{order.maintenanceId ? 'Preventiva' : 'Atendimento'} · {order.completedAt ? `Concluído em ${new Date(order.completedAt).toLocaleString('pt-BR')}` : `Agendamento: ${order.scheduledFor}`}</small>
        {order.hasReport && <button className="secondary-button" disabled={opening} onClick={() => void open(order)}>Ver relatório, fotos e medições</button>}
      </article>)}
      <Pagination page={page} total={Math.max(1, Math.ceil(data.total / data.limit))} onChange={setPage} />
    </>}
    {report && <TechnicalReportModal order={report} editable={false} onClose={() => setReport(null)} onSave={async () => {}} />}
  </section>
}
