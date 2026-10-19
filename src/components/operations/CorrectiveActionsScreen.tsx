import { useEffect, useState, type FormEvent } from 'react'
import type { CorrectiveAction, ServiceOrder } from '../../models/operational'
import { requestOnline } from '../../services/http'
import { operationalService } from '../../services/operational-service'
import { useSessionUser } from '../session-context'
import { DetailModal } from '../ui/DetailModal'
import { Pagination } from '../ui/Pagination'
import { TechnicalReportModal } from './TechnicalReportModal'

type Summary = { open: number; overdue: number; unplanned: number; awaiting: number }
type Result = { items: CorrectiveAction[]; total: number; limit: number; summary: Summary }
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const dateLabel = (value: string) => value ? value.split('-').reverse().join('/') : 'Sem prazo definido'
export function CorrectiveSummary({ onOpen }: { onOpen: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { let cancelled = false; requestOnline<Summary>('corrective-actions?summary=1').then(value => { if (!cancelled) setSummary(value) }).catch(() => { if (!cancelled) setError('Conecte-se para atualizar as pendências.') }); return () => { cancelled = true } }, [])
  return <article className="panel corrective-summary"><h2>Pendências corretivas</h2>{summary ? <p><strong>{summary.open}</strong> abertas · <strong>{summary.overdue}</strong> vencidas · {summary.awaiting} aguardando validação · {summary.unplanned} sem prazo</p> : <p>{error || 'Carregando pendências…'}</p>}<button className="secondary-button" onClick={onOpen}>Acompanhar pendências</button></article>
}
export function CorrectiveActionsScreen({ equipmentId, compact = false }: { equipmentId?: string; compact?: boolean }) {
  const user = useSessionUser()
  const canManage = !!user && ['Administrador', 'Gestor'].includes(user.role)
  const [data, setData] = useState<Result | null>(null)
  const [status, setStatus] = useState('')
  const [overdue, setOverdue] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<CorrectiveAction | null>(null)
  const [assignment, setAssignment] = useState({ technicianId: '', priority: 'Média', dueDate: '' })
  const [reviewNotes, setReviewNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [report, setReport] = useState<ServiceOrder | null>(null)
  useEffect(() => {
    let cancelled = false; setError(''); setData(null)
    const params = new URLSearchParams({ page: String(page), q: query }); if (status) params.set('status', status); if (overdue) params.set('overdue', '1'); if (equipmentId) params.set('equipmentId', equipmentId)
    requestOnline<Result>(`corrective-actions?${params}`).then(value => { if (!cancelled) setData(value) }).catch(cause => { if (!cancelled) setError(cause instanceof TypeError ? 'Conecte-se para consultar as pendências.' : (cause as Error).message) })
    return () => { cancelled = true }
  }, [page, status, overdue, query, revision, equipmentId])
  const refresh = () => setRevision(value => value + 1)
  const open = async (id: string) => {
    setBusy(true); setError('')
    try { const item = await requestOnline<CorrectiveAction>(`corrective-actions/${encodeURIComponent(id)}`); setSelected(item); setAssignment({ technicianId: item.technicianId, priority: item.priority, dueDate: item.dueDate }); setReviewNotes('') }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const change = async (action: string, payload: unknown, method = 'POST') => {
    if (!selected || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const path = `corrective-actions/${encodeURIComponent(selected.id)}${action ? `/${action}` : ''}`
      if (action === 'generate-order') {
        const result = await requestOnline<{ order: ServiceOrder; created: boolean }>(path, method, payload)
        setNotice(`${result.order.code}: ${result.created ? 'OS corretiva criada' : 'OS já existente'}. O técnico registra a solução em Meus atendimentos.`)
        await operationalService.orders.load()
      } else { await requestOnline(path, method, payload); setNotice(action === 'review' ? 'Validação registrada.' : 'Responsável, prioridade e prazo atualizados.') }
      setSelected(await requestOnline<CorrectiveAction>(`corrective-actions/${encodeURIComponent(selected.id)}`)); refresh()
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const assignmentChanged = !!selected && (assignment.technicianId !== selected.technicianId || assignment.priority !== selected.priority || assignment.dueDate !== selected.dueDate)
  const save = (event: FormEvent) => { event.preventDefault(); void change('', assignment, 'PATCH') }
  const importReports = async () => {
    if (!window.confirm('Criar pendências para as não conformidades dos relatórios já salvos? As existentes serão preservadas.')) return
    setBusy(true); setError('')
    try { const result = await requestOnline<{ created: number }>('corrective-actions/import', 'POST', {}); setNotice(`${result.created} pendência(s) criada(s).`); refresh() }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const openReport = async (id: string) => {
    setBusy(true); setError('')
    try { setReport(await requestOnline<ServiceOrder>(`service-orders/${encodeURIComponent(id)}`)) }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="corrective-actions" aria-label="Pendências corretivas">
    <h3>{compact ? 'Pendências deste equipamento' : 'Pendências e ações corretivas'}</h3>
    <p>As não conformidades geram pendências ao salvar ou sincronizar o relatório. Consulta e gerenciamento requerem conexão.</p>
    {!compact && data && <div className="resource-metrics"><div><span>Abertas</span><b>{data.summary.open}</b></div><div><span>Vencidas</span><b>{data.summary.overdue}</b></div><div><span>Aguardando validação</span><b>{data.summary.awaiting}</b></div></div>}
    <div className="resource-toolbar"><label className="filter-select">Buscar<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} /></label><label className="filter-select">Situação<select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="">Todas</option>{['Aberta', 'Em correção', 'Aguardando validação', 'Resolvida'].map(value => <option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={overdue} onChange={event => { setOverdue(event.target.checked); setPage(1) }} /> Somente vencidas</label><button className="secondary-button" disabled={busy} onClick={refresh}>Atualizar</button>{canManage && !compact && <button className="secondary-button" disabled={busy} onClick={() => void importReports()}>Importar não conformidades anteriores</button>}</div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{!data && !error && <p role="status">Carregando pendências…</p>}
    {data && <>{!data.items.length && <p>Nenhuma pendência corresponde ao filtro.</p>}{data.items.map(item => <article className="panel corrective-card" key={item.id}>
      <div><strong>{item.code} · {item.sourceLabel}</strong><span className="corrective-status">{item.status}</span></div>
      <p>{item.equipmentLabel || operationalService.equipment.findById(item.equipmentId)?.name || 'Equipamento vinculado'}</p>
      <p>Origem: {item.sourceOrderCode} · Prioridade {item.priority}</p>
      <p className={item.status !== 'Resolvida' && item.dueDate && item.dueDate < today() ? 'checklist-issue' : ''}>Prazo: {dateLabel(item.dueDate)}</p>
      <p>Responsável: {operationalService.technicians.findById(item.technicianId)?.name || 'Técnico vinculado'}</p>
      {item.evidence.notes && <p>{item.evidence.notes}</p>}<small>{item.evidencePhotoCount || 0} foto(s) da inspeção</small>
      <button className="secondary-button" disabled={busy} onClick={() => void open(item.id)}>Detalhar pendência</button>
    </article>)}<Pagination page={page} total={Math.max(1, Math.ceil(data.total / data.limit))} onChange={setPage} /></>}
    {selected && <DetailModal title={`${selected.code} · ${selected.sourceLabel}`} onClose={() => { if (!busy) setSelected(null) }}>
      <p><strong>{selected.status}</strong> · Origem: {selected.sourceOrderCode}</p><p>{selected.evidence.notes || 'Sem observação na inspeção.'}</p>
      <div className="order-photo-grid">{selected.evidence.photos.map(photo => <figure key={photo.id}><img className="order-photo" src={photo.data} alt={photo.caption || selected.sourceLabel} /><figcaption>{photo.caption || 'Evidência da inspeção'}</figcaption></figure>)}</div>
      {canManage && selected.status === 'Aberta' && <form className="resource-form" onSubmit={save}><fieldset disabled={busy} className="technical-report-fields"><label>Responsável<select required value={assignment.technicianId} onChange={event => setAssignment({ ...assignment, technicianId: event.target.value })}>{operationalService.technicians.list().map(tech => <option key={tech.id} value={tech.id}>{tech.name}{tech.status !== 'Ativo' ? ' (inativo)' : ''}</option>)}</select></label><label>Prioridade<select value={assignment.priority} onChange={event => setAssignment({ ...assignment, priority: event.target.value })}>{['Baixa', 'Média', 'Alta'].map(value => <option key={value}>{value}</option>)}</select></label><label>Prazo<input type="date" required min="1900-01-01" max="9999-12-31" value={assignment.dueDate} onChange={event => setAssignment({ ...assignment, dueDate: event.target.value })} /></label><button className="primary-button">Salvar responsável e prazo</button></fieldset></form>}
      {canManage && selected.status === 'Aberta' && assignmentChanged && <p>Salve responsável e prazo antes de gerar a OS.</p>}
      {selected.feedback && <p>Validação anterior: {selected.feedback}</p>}
      {selected.resolution && <div><h3>Solução aprovada</h3><p>{selected.resolution.notes}</p><small>{new Date(selected.resolution.validatedAt).toLocaleString('pt-BR')}</small></div>}
      <div className="form-actions">{canManage && selected.status === 'Aberta' && <button className="primary-button" disabled={busy || !selected.dueDate || assignmentChanged} onClick={() => void change('generate-order', {})}>Gerar OS corretiva</button>}{selected.correctiveOrderId && <button className="secondary-button" disabled={busy} onClick={() => void openReport(selected.correctiveOrderId!)}>Ver OS e solução</button>}{canManage && <button className="secondary-button" disabled={busy} onClick={() => void openReport(selected.sourceOrderId)}>Ver relatório de origem</button>}</div>
      {canManage && selected.status === 'Aguardando validação' && <form className="resource-form" onSubmit={event => { event.preventDefault(); void change('review', { decision: 'resolve', notes: reviewNotes }) }}><label>Observações da validação<textarea required maxLength={5000} rows={3} value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} /></label><div className="form-actions"><button className="primary-button" disabled={busy || !reviewNotes.trim()}>Aprovar solução</button><button type="button" className="secondary-button" disabled={busy || !reviewNotes.trim()} onClick={() => void change('review', { decision: 'rework', notes: reviewNotes })}>Devolver para correção</button></div></form>}
      {error && <p role="alert">{error}</p>}
    </DetailModal>}
    {report && <TechnicalReportModal order={report} editable={false} onClose={() => setReport(null)} onSave={async () => {}} />}
  </section>
}
