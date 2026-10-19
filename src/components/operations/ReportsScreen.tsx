import { useMemo, useState } from 'react'
import type { MaintenanceItem, ServiceOrder, TechnicalReportInput } from '../../models/operational'
import { operationalService } from '../../services/operational-service'
import { apiEnabled, request } from '../../services/api'
import { useSessionUser } from '../session-context'
import { StatusBadge } from '../ui/StatusBadge'
import { TechnicalReportModal } from './TechnicalReportModal'
import { ReportPdfButton } from './ReportPdfButton'

type ReportKind = 'Ordens de Serviço' | 'Manutenção preventiva' | 'Relatório técnico'
const preferenceKey = 'app-acc-default-report'
const clientName = (id: string) => operationalService.clients.findById(id)?.name ?? '—'
const locationName = (id: string) => operationalService.locations.findById(id)?.name ?? '—'
const equipmentName = (id: string) => operationalService.equipment.findById(id)?.name ?? '—'
const technicianName = (id: string) => operationalService.technicians.findById(id)?.name ?? '—'
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
function downloadCsv(name: string, rows: string[][]) {
  const content = `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url)
}

export function ReportsScreen() {
  const user = useSessionUser()
  const [kind, setKind] = useState<ReportKind>(() => {
    const saved = localStorage.getItem(preferenceKey)
    return saved === 'Manutenção preventiva' || saved === 'Relatório técnico' ? saved : 'Ordens de Serviço'
  })
  const [status, setStatus] = useState('Todos')
  const [orders, setOrders] = useState(() => operationalService.orders.list())
  const maintenance = operationalService.maintenance.list()
  const [technicalOrder, setTechnicalOrder] = useState<ServiceOrder | null>(null)
  const orderRows = useMemo(() => orders.filter(item => status === 'Todos' || item.status === status), [orders, status])
  const maintenanceRows = useMemo(() => maintenance.filter(item => status === 'Todos' || item.status === status), [maintenance, status])
  const isOrders = kind === 'Ordens de Serviço'
  const isTechnicalReport = kind === 'Relatório técnico'
  const openCount = orders.filter(item => item.status !== 'Concluída').length
  const completedCount = orders.filter(item => item.status === 'Concluída').length
  const overdueCount = maintenance.filter(item => item.status !== 'Em dia').length
  const visibleOrders = isOrders || isTechnicalReport ? orderRows : []
  const visibleMaintenance = !isOrders && !isTechnicalReport ? maintenanceRows : []
  const changeReport = (value: ReportKind) => {
    setKind(value)
    setStatus('Todos')
    localStorage.setItem(preferenceKey, value)
  }
  const exportReport = () => {
    if (isTechnicalReport) {
      const reportedOrders = orderRows.filter(item => item.technicalReport)
      downloadCsv('relatorio-tecnico.csv', [
        ['Ordem', 'Cliente', 'Unidade', 'Equipamento', 'Técnico', 'Data do relatório', 'Diagnóstico', 'Serviço executado', 'Materiais utilizados', 'Recomendações'],
        ...reportedOrders.map(item => [item.code, clientName(item.clientId), locationName(item.locationId), equipmentName(item.equipmentId), technicianName(item.technicalReport?.technicianId ?? item.technicianId), item.technicalReport?.updatedAt ?? '', item.technicalReport?.diagnosis ?? '', item.technicalReport?.workPerformed ?? '', item.technicalReport?.materialsUsed ?? '', item.technicalReport?.recommendations ?? '']),
      ])
    } else if (isOrders) {
      downloadCsv('relatorio-ordens-de-servico.csv', [['Ordem', 'Cliente', 'Unidade', 'Equipamento', 'Técnico', 'Agendamento', 'Prioridade', 'Status', 'Descrição'], ...orderRows.map(item => [item.code, clientName(item.clientId), locationName(item.locationId), equipmentName(item.equipmentId), technicianName(item.technicianId), item.scheduledFor, item.priority, item.status, item.description])])
    } else {
      downloadCsv('relatorio-manutencao-preventiva.csv', [['Atividade', 'Equipamento', 'Vencimento', 'Frequência', 'Técnico', 'Status'], ...maintenanceRows.map((item: MaintenanceItem) => [item.title, equipmentName(item.equipmentId), item.dueDate, item.frequency, technicianName(item.technicianId), item.status])])
    }
  }
  const saveTechnicalReport = async (report: TechnicalReportInput) => {
    if (!technicalOrder) return
    const saved = await request<ServiceOrder>(`service-orders/${encodeURIComponent(technicalOrder.id)}/technical-report`, 'PATCH', report)
    setOrders(current => current.map(order => order.id === saved.id ? saved : order))
    setTechnicalOrder(null)
    try { setOrders(await operationalService.orders.load()) } catch { /* A resposta salva já atualizou a tela; a próxima carga tentará novamente. */ }
  }
  const technicalReportContent = <div className="technical-report-list">
    {visibleOrders.map(item => <article className="technical-report-row" key={item.id}>
      <div className="technical-report-row__main"><strong>{item.code} · {clientName(item.clientId)}</strong><span>{locationName(item.locationId)} · {equipmentName(item.equipmentId)}</span><small>{item.technicalReport ? `Preenchido em ${new Date(item.technicalReport.updatedAt).toLocaleDateString('pt-BR')}` : 'Relatório técnico pendente'}</small></div>
      <div className="technical-report-row__aside"><StatusBadge status={item.status} /><button className={user?.role === 'Técnico' ? 'primary-button' : 'secondary-button'} onClick={() => setTechnicalOrder(item)}>{user?.role === 'Técnico' ? (item.technicalReport ? 'Editar relatório' : 'Preencher relatório') : 'Visualizar'}</button><ReportPdfButton order={item} /></div>
    </article>)}
    {visibleOrders.length === 0 && <p className="resource-table__empty">Nenhuma ordem corresponde ao filtro.</p>}
  </div>
  const ordersContent = <div className="report-table">
    <div className="report-table__head"><span>ORDEM</span><span>CLIENTE / UNIDADE</span><span>TÉCNICO</span><span>AGENDAMENTO</span><span>STATUS</span></div>
    {visibleOrders.map(item => <div className="report-table__row" key={item.id}><strong>{item.code}</strong><span>{clientName(item.clientId)}<small>{locationName(item.locationId)}</small></span><span>{technicianName(item.technicianId)}</span><span>{item.scheduledFor}</span><StatusBadge status={item.status} /></div>)}
    {visibleOrders.length === 0 && <p className="resource-table__empty">Nenhuma ordem corresponde ao filtro.</p>}
  </div>
  const maintenanceContent = <div className="report-table">
    <div className="report-table__head report-table__head--maintenance"><span>ATIVIDADE</span><span>EQUIPAMENTO</span><span>VENCIMENTO</span><span>FREQUÊNCIA</span><span>STATUS</span></div>
    {visibleMaintenance.map(item => <div className="report-table__row report-table__row--maintenance" key={item.id}><strong>{item.title}</strong><span>{equipmentName(item.equipmentId)}</span><span>{item.dueDate}</span><span>{item.frequency}</span><StatusBadge status={item.status} /></div>)}
    {visibleMaintenance.length === 0 && <p className="resource-table__empty">Nenhuma preventiva corresponde ao filtro.</p>}
  </div>

  return <section className="reports-screen">
    <div className="metric-grid reports-metrics">
      <article className="metric-card"><p>Ordens cadastradas</p><strong>{orders.length}</strong><span className="metric-card__helper">{openCount} em aberto</span></article>
      <article className="metric-card"><p>Ordens concluídas</p><strong>{completedCount}</strong><span className="metric-card__helper">No total registrado</span></article>
      <article className="metric-card"><p>Preventivas em atenção</p><strong>{overdueCount}</strong><span className="metric-card__helper">Atrasadas ou críticas</span></article>
      <article className="metric-card"><p>Itens no relatório</p><strong>{isOrders || isTechnicalReport ? orderRows.length : maintenanceRows.length}</strong><span className="metric-card__helper">Após aplicar o filtro</span></article>
    </div>
    <article className="panel reports-panel">
      <div className="panel__header"><div><h2>Relatórios operacionais</h2><p>Exporte listas em CSV. Em Relatório técnico, baixe o PDF de cada atendimento com suas fotos.</p></div><button className="primary-button" onClick={exportReport}>Exportar CSV</button></div>
      <div className="resource-toolbar reports-toolbar">
        <label className="filter-select"><span>Relatório</span><select value={kind} onChange={event => changeReport(event.target.value as ReportKind)}><option>Ordens de Serviço</option><option>Manutenção preventiva</option><option>Relatório técnico</option></select></label>
        <label className="filter-select"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option>Todos</option>{(isOrders || isTechnicalReport ? ['Agendada', 'Em andamento', 'Concluída'] : ['Em dia', 'Atrasada', 'Crítica']).map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      {isTechnicalReport ? technicalReportContent : isOrders ? ordersContent : maintenanceContent}
    </article>
    {technicalOrder && <TechnicalReportModal order={technicalOrder} editable={apiEnabled && user?.role === 'Técnico'} onClose={() => setTechnicalOrder(null)} onSave={saveTechnicalReport} />}
  </section>
}
