import { useEffect, useState } from 'react'
import type { ServiceOrder, TechnicalReport } from '../../models/operational'
import { request } from '../../services/api'
import { operationalService } from '../../services/operational-service'
import { useSessionUser } from '../session-context'
import { StatusBadge } from '../ui/StatusBadge'
import { TechnicalReportModal } from './TechnicalReportModal'

export function FieldServiceScreen() {
  const user = useSessionUser()
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [status, setStatus] = useState('Abertas')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reportOrder, setReportOrder] = useState<ServiceOrder | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    operationalService.orders.load().then(items => {
      if (!cancelled) setOrders(items.filter(item => item.technicianId === user?.technicianId))
    }).catch(cause => { if (!cancelled) setError((cause as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.technicianId, revision])
  const replaceOrder = (saved: ServiceOrder) => setOrders(current => current.map(item => item.id === saved.id ? saved : item))
  const advance = async (order: ServiceOrder) => {
    if (busy || order.technicianId !== user?.technicianId || user?.role !== 'Técnico' || order.status === 'Concluída') return
    if (order.status === 'Em andamento' && !window.confirm(`Concluir o atendimento ${order.code}?`)) return
    setBusy(order.id); setError(''); setNotice('')
    try {
      const saved = await operationalService.orders.update(order.id, { status: order.status === 'Agendada' ? 'Em andamento' : 'Concluída' })
      if (!saved) throw new Error('Ordem não encontrada. Atualize a lista.')
      replaceOrder(saved); setNotice(`${saved.code}: ${saved.status}.`)
    } catch (cause) { setError((cause as Error).message) } finally { setBusy(null) }
  }
  const saveReport = async (report: Pick<TechnicalReport, 'diagnosis' | 'workPerformed' | 'materialsUsed' | 'recommendations'>) => {
    if (!reportOrder) return
    const saved = await request<ServiceOrder>(`service-orders/${encodeURIComponent(reportOrder.id)}/technical-report`, 'PATCH', report)
    replaceOrder(saved); setReportOrder(null); setNotice(`Relatório de ${saved.code} salvo.`)
    try { await operationalService.orders.load() } catch { /* O salvamento já foi confirmado; atualização manual disponível. */ }
  }
  const visible = orders.filter(order => {
    const client = operationalService.clients.findById(order.clientId)
    const location = operationalService.locations.findById(order.locationId)
    return (status === 'Todas' || (status === 'Abertas' ? order.status !== 'Concluída' : order.status === status)) &&
      `${order.code} ${client?.name ?? ''} ${location?.name ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  })
  return <section className="field-screen" aria-label="Meus atendimentos">
    <div><h2>Meus atendimentos</h2><p>Ordens atribuídas a você. Conecte-se para consultar e salvar.</p></div>
    <div className="resource-toolbar">
      <label className="filter-select">Buscar ordem, cliente ou local<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="filter-select">Status<select value={status} onChange={event => setStatus(event.target.value)}>{['Abertas', 'Agendada', 'Em andamento', 'Concluída', 'Todas'].map(value => <option key={value}>{value}</option>)}</select></label>
      <button className="secondary-button" disabled={loading || !!busy} onClick={() => setRevision(value => value + 1)}>Atualizar ordens</button>
    </div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Carregando atendimentos…</p> : <>
      <p>{visible.length} atendimento(s)</p>
      {visible.map(order => {
        const location = operationalService.locations.findById(order.locationId)
        const equipment = operationalService.equipment.findById(order.equipmentId)
        return <article className="panel field-order" key={order.id}>
          <header><h2>{order.code}</h2><StatusBadge status={order.status} /></header>
          <h3>{operationalService.clients.findById(order.clientId)?.name ?? 'Cliente indisponível'}</h3>
          <dl><div><dt>Local</dt><dd>{location?.name ?? '—'}</dd></div><div><dt>Endereço</dt><dd>{location ? `${location.address} · ${location.city}` : '—'}</dd></div><div><dt>Equipamento</dt><dd>{equipment ? `${equipment.tag} · ${equipment.name}` : '—'}</dd></div><div><dt>Agendamento</dt><dd>{order.scheduledFor}</dd></div><div><dt>Prioridade</dt><dd>{order.priority}</dd></div></dl>
          <p className="field-description">{order.description}</p>
          <p>{order.technicalReport ? 'Relatório técnico preenchido' : 'Relatório técnico pendente'}</p>
          <div className="form-actions">
            <button className="secondary-button" disabled={!!busy} onClick={() => setReportOrder(order)}>{order.technicalReport ? 'Editar relatório' : 'Preencher relatório'}</button>
            {order.status !== 'Concluída' && <button className="primary-button" disabled={!!busy} onClick={() => void advance(order)}>{busy === order.id ? 'Salvando…' : order.status === 'Agendada' ? 'Iniciar atendimento' : 'Concluir atendimento'}</button>}
          </div>
        </article>
      })}
      {!visible.length && <p className="panel">Nenhuma ordem atribuída corresponde ao filtro.</p>}
    </>}
    {reportOrder && <TechnicalReportModal order={reportOrder} editable={user?.role === 'Técnico' && reportOrder.technicianId === user.technicianId} onClose={() => setReportOrder(null)} onSave={saveReport} />}
  </section>
}
