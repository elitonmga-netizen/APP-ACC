import { useEffect, useState, type FormEvent } from 'react'
import catalog from '../../../shared/maintenance-checklists.json'
import type { MaintenanceItem, MaintenanceSchedule, ServiceOrder } from '../../models/operational'
import { operationalService } from '../../services/operational-service'
import { requestOnline } from '../../services/http'
import { useSessionUser } from '../session-context'
import { DetailModal } from '../ui/DetailModal'
import { StatusBadge } from '../ui/StatusBadge'
import { EquipmentHistory } from './EquipmentHistory'

type Form = { title: string; equipmentId: string; technicianId: string; nextDue: string; interval: string; unit: 'months' | 'days'; checklistModelId: string }
const empty: Form = { title: '', equipmentId: '', technicianId: '', nextDue: '', interval: '1', unit: 'months', checklistModelId: '' }
const isoDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const dateLabel = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : day
const fromLegacy = (date: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(date) ? date.split('/').reverse().join('-') : /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
const frequency = (schedule: MaintenanceSchedule) => schedule.unit === 'days' ? `A cada ${schedule.interval} dia(s)` : ({ 1: 'Mensal', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' }[schedule.interval] || `A cada ${schedule.interval} meses`)
export function MaintenancePlanningScreen() {
  const user = useSessionUser()
  const canEdit = user && ['Administrador', 'Gestor'].includes(user.role)
  const [items, setItems] = useState<MaintenanceItem[]>([])
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Todos')
  const [form, setForm] = useState<Form>(empty)
  const [editing, setEditing] = useState<MaintenanceItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [history, setHistory] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const equipment = operationalService.equipment.list()
  const technicians = operationalService.technicians.list()
  const today = isoDay()
  const daysUntil = (item: MaintenanceItem) => item.schedule ? (Date.parse(item.schedule.nextDue + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000 : Infinity
  const refresh = async () => {
    const [plans, loadedOrders] = await Promise.all([operationalService.maintenance.load(), operationalService.orders.load(), operationalService.equipment.load()])
    setItems(plans); setOrders(loadedOrders)
  }
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([operationalService.maintenance.load(), operationalService.orders.load(), operationalService.equipment.load()]).then(([plans, loadedOrders]) => { if (!cancelled) { setItems(plans); setOrders(loadedOrders) } }).catch(cause => { if (!cancelled) setError((cause as Error).message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [revision])
  const open = (item?: MaintenanceItem) => {
    setError(''); setEditing(item || null)
    setForm(item ? { title: item.title, equipmentId: item.equipmentId, technicianId: item.technicianId, nextDue: item.schedule?.nextDue || fromLegacy(item.dueDate), interval: String(item.schedule?.interval || 1), unit: item.schedule?.unit || 'months', checklistModelId: item.schedule?.checklistModelId || '' } : empty)
    setShowForm(true)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const schedule: MaintenanceSchedule = { interval: Number(form.interval), unit: form.unit, nextDue: form.nextDue, anchorDay: editing?.schedule?.nextDue === form.nextDue ? editing.schedule.anchorDay : Number(form.nextDue.slice(-2)), checklistModelId: form.checklistModelId }
      const payload = { title: form.title.trim(), equipmentId: form.equipmentId, technicianId: form.technicianId, dueDate: form.nextDue, frequency: frequency(schedule), status: 'Em dia', schedule }
      await requestOnline<MaintenanceItem>(editing ? `maintenance/${encodeURIComponent(editing.id)}` : 'maintenance', editing ? 'PATCH' : 'POST', payload)
      setShowForm(false); setNotice('Preventiva programada. Use Gerar OS para enviar o atendimento ao técnico.')
      await refresh()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const generate = async (item: MaintenanceItem) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (!navigator.onLine) throw new Error('Conecte-se para gerar a OS preventiva.')
      const result = await requestOnline<{ order: ServiceOrder; created: boolean }>(`maintenance/${encodeURIComponent(item.id)}/generate-order`, 'POST', {})
      setNotice(`${result.order.code}: ${result.created ? 'criada e atribuída ao técnico' : 'já existe para esta preventiva'}.`)
      await refresh()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const remove = async (item: MaintenanceItem) => {
    if (!window.confirm(`Excluir a preventiva ${item.title}?`)) return
    setBusy(true); setError(''); setNotice('')
    try { await requestOnline(`maintenance/${encodeURIComponent(item.id)}`, 'DELETE'); setNotice('Preventiva excluída.'); await refresh() }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const visible = items.filter(item => {
    const asset = equipment.find(row => row.id === item.equipmentId)
    return `${item.title} ${asset?.tag} ${asset?.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (filter === 'Todos' || filter === 'Vencidas' && daysUntil(item) < 0 || filter === 'Próximos 30 dias' && daysUntil(item) >= 0 && daysUntil(item) <= 30 || filter === 'Sem programação' && !item.schedule)
  }).sort((a, b) => (a.schedule?.nextDue || '9999').localeCompare(b.schedule?.nextDue || '9999'))
  return <section className="maintenance-planning">
    <div className="resource-metrics"><div><span>Programadas</span><b>{items.filter(item => item.schedule).length}</b></div><div><span>Vencidas</span><b>{items.filter(item => daysUntil(item) < 0).length}</b></div><div><span>Próximos 30 dias</span><b>{items.filter(item => daysUntil(item) >= 0 && daysUntil(item) <= 30).length}</b></div></div>
    <div className="resource-toolbar"><label className="filter-select">Buscar atividade ou equipamento<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><label className="filter-select">Prazo<select value={filter} onChange={event => setFilter(event.target.value)}>{['Todos', 'Vencidas', 'Próximos 30 dias', 'Sem programação'].map(label => <option key={label}>{label}</option>)}</select></label><button disabled={busy} className="secondary-button" onClick={() => setRevision(value => value + 1)}>Atualizar</button>{canEdit && <button className="primary-button" onClick={() => open()}>+ Programar preventiva</button>}</div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">Carregando preventivas…</p>}
    {!loading && !visible.length && <p>Nenhuma preventiva corresponde ao filtro.</p>}
    {visible.map(item => {
      const asset = equipment.find(row => row.id === item.equipmentId)
      const active = orders.find(order => order.maintenanceId === item.id && order.status !== 'Concluída')
      return <article className="panel preventive-card" key={item.id}>
        <div><h3>{item.title}</h3><StatusBadge status={item.status} /></div>
        <p>{asset?.tag} · {asset?.name || 'Equipamento'}</p>
        <p>{item.schedule ? `Próximo vencimento: ${dateLabel(item.schedule.nextDue)} · ${frequency(item.schedule)}` : `Sem programação automática · vencimento anterior: ${item.dueDate} · ${item.frequency}`}</p>
        <p>Técnico: {technicians.find(tech => tech.id === item.technicianId)?.name || '—'}</p>
        {item.schedule && <p>Checklist: {catalog.models.find(model => model.id === item.schedule?.checklistModelId)?.name}</p>}
        {active && <p>OS em aberto: <strong>{active.code}</strong> · {active.status}</p>}
        <div className="form-actions">{canEdit && <><button disabled={busy || !!active} className="secondary-button" onClick={() => open(item)}>{item.schedule ? 'Editar programação' : 'Programar'}</button><button disabled={busy || !item.schedule || !!active} className="primary-button" onClick={() => void generate(item)}>Gerar OS</button></>}<button className="secondary-button" onClick={() => setHistory(item.equipmentId)}>Histórico do equipamento</button>{user?.role === 'Administrador' && !orders.some(order => order.maintenanceId === item.id) && <button disabled={busy} className="secondary-button" onClick={() => void remove(item)}>Excluir</button>}</div>
        {active && canEdit && <small>Conclua a OS em aberto antes de editar esta programação.</small>}
      </article>
    })}
    {showForm && <DetailModal title={editing ? 'Programar preventiva' : 'Nova preventiva'} onClose={() => { if (!busy) setShowForm(false) }}><form className="resource-form" onSubmit={event => void save(event)}><fieldset className="technical-report-fields" disabled={busy}>
      <label>Atividade<input required maxLength={2000} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
      <label>Equipamento<select disabled={!!editing && orders.some(order => order.maintenanceId === editing.id)} required value={form.equipmentId} onChange={event => setForm({ ...form, equipmentId: event.target.value })}><option value="">Selecione…</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.tag} · {item.name}</option>)}</select></label>
      <label>Técnico<select required value={form.technicianId} onChange={event => setForm({ ...form, technicianId: event.target.value })}><option value="">Selecione…</option>{technicians.filter(item => item.status === 'Ativo').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Próximo vencimento<input type="date" required min="1900-01-01" max="9999-12-31" value={form.nextDue} onChange={event => setForm({ ...form, nextDue: event.target.value })} /></label>
      <label>Periodicidade<select value={form.unit === 'months' && ['1', '3', '6', '12'].includes(form.interval) ? form.interval : 'custom'} onChange={event => { if (event.target.value === 'custom') setForm({ ...form, interval: '2', unit: 'months' }); else setForm({ ...form, unit: 'months', interval: event.target.value }) }}><option value="1">Mensal</option><option value="3">Trimestral</option><option value="6">Semestral</option><option value="12">Anual</option><option value="custom">Personalizada</option></select></label>
      <div className="checklist-measurements"><label>Intervalo<input type="number" required min={1} max={form.unit === 'months' ? 120 : 3650} step={1} value={form.interval} onChange={event => setForm({ ...form, interval: event.target.value })} /></label><label>Unidade<select value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value as Form['unit'] })}><option value="months">Meses</option><option value="days">Dias</option></select></label></div>
      <label>Checklist do atendimento<select required value={form.checklistModelId} onChange={event => setForm({ ...form, checklistModelId: event.target.value })}><option value="">Selecione…</option>{catalog.models.map(model => <option value={model.id} key={model.id}>{model.name}</option>)}</select></label>
      <p>A próxima data segue o calendário programado. Ao concluir, ciclos vencidos são pulados até o primeiro vencimento futuro. Gerar a OS requer conexão.</p>
    </fieldset>{error && <p role="alert">{error}</p>}<div className="form-actions"><button type="button" disabled={busy} className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button><button disabled={busy} className="primary-button">{busy ? 'Salvando…' : 'Salvar programação'}</button></div></form></DetailModal>}
    {history && <DetailModal title="Histórico do equipamento" onClose={() => setHistory(null)}><EquipmentHistory equipmentId={history} /></DetailModal>}
  </section>
}
