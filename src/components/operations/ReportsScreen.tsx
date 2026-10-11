import { useMemo, useState } from 'react'
import type { MaintenanceItem, ServiceOrder } from '../../models/operational'
import { operationalService } from '../../services/operational-service'
import { StatusBadge } from '../ui/StatusBadge'

type ReportKind = 'Ordens de Serviço' | 'Manutenção preventiva'
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
  const [kind, setKind] = useState<ReportKind>(() => localStorage.getItem(preferenceKey) === 'Manutenção preventiva' ? 'Manutenção preventiva' : 'Ordens de Serviço')
  const [status, setStatus] = useState('Todos')
  const orders = operationalService.orders.list()
  const maintenance = operationalService.maintenance.list()
  const orderRows = useMemo(() => orders.filter(item => status === 'Todos' || item.status === status), [orders, status])
  const maintenanceRows = useMemo(() => maintenance.filter(item => status === 'Todos' || item.status === status), [maintenance, status])
  const isOrders = kind === 'Ordens de Serviço'
  const openCount = orders.filter(item => item.status !== 'Concluída').length
  const completedCount = orders.filter(item => item.status === 'Concluída').length
  const overdueCount = maintenance.filter(item => item.status !== 'Em dia').length
  const visibleOrders = isOrders ? orderRows : []
  const visibleMaintenance = isOrders ? [] : maintenanceRows
  const changeReport = (value: ReportKind) => {
    setKind(value)
    setStatus('Todos')
    localStorage.setItem(preferenceKey, value)
  }
  const exportReport = () => {
    if (isOrders) downloadCsv('relatorio-ordens-de-servico.csv', [['Ordem', 'Cliente', 'Unidade', 'Equipamento', 'Técnico', 'Agendamento', 'Prioridade', 'Status', 'Descrição'], ...orderRows.map((item: ServiceOrder) => [item.code, clientName(item.clientId), locationName(item.locationId), equipmentName(item.equipmentId), technicianName(item.technicianId), item.scheduledFor, item.priority, item.status, item.description])])
    else downloadCsv('relatorio-manutencao-preventiva.csv', [['Atividade', 'Equipamento', 'Vencimento', 'Frequência', 'Técnico', 'Status'], ...maintenanceRows.map((item: MaintenanceItem) => [item.title, equipmentName(item.equipmentId), item.dueDate, item.frequency, technicianName(item.technicianId), item.status])])
  }

  return <section className="reports-screen">
    <div className="metric-grid reports-metrics"><article className="metric-card"><p>Ordens cadastradas</p><strong>{orders.length}</strong><span className="metric-card__helper">{openCount} em aberto</span></article><article className="metric-card"><p>Ordens concluídas</p><strong>{completedCount}</strong><span className="metric-card__helper">No total registrado</span></article><article className="metric-card"><p>Preventivas em atenção</p><strong>{overdueCount}</strong><span className="metric-card__helper">Atrasadas ou críticas</span></article><article className="metric-card"><p>Itens no relatório</p><strong>{isOrders ? orderRows.length : maintenanceRows.length}</strong><span className="metric-card__helper">Após aplicar o filtro</span></article></div>
    <article className="panel reports-panel">
      <div className="panel__header"><div><h2>Relatórios operacionais</h2><p>Consulte ordens e manutenções e baixe os resultados em CSV.</p></div><button className="primary-button" onClick={exportReport}>Exportar CSV</button></div>
      <div className="resource-toolbar reports-toolbar"><label className="filter-select"><span>Relatório</span><select value={kind} onChange={event => changeReport(event.target.value as ReportKind)}><option>Ordens de Serviço</option><option>Manutenção preventiva</option></select></label><label className="filter-select"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option>Todos</option>{(isOrders ? ['Agendada', 'Em andamento', 'Concluída'] : ['Em dia', 'Atrasada', 'Crítica']).map(value => <option key={value}>{value}</option>)}</select></label></div>
      {isOrders ? <div className="report-table"><div className="report-table__head"><span>ORDEM</span><span>CLIENTE / UNIDADE</span><span>TÉCNICO</span><span>AGENDAMENTO</span><span>STATUS</span></div>{visibleOrders.map(item => <div className="report-table__row" key={item.id}><strong>{item.code}</strong><span>{clientName(item.clientId)}<small>{locationName(item.locationId)}</small></span><span>{technicianName(item.technicianId)}</span><span>{item.scheduledFor}</span><StatusBadge status={item.status} /></div>)}{visibleOrders.length === 0 && <p className="resource-table__empty">Nenhuma ordem corresponde ao filtro.</p>}</div> : <div className="report-table"><div className="report-table__head report-table__head--maintenance"><span>ATIVIDADE</span><span>EQUIPAMENTO</span><span>VENCIMENTO</span><span>FREQUÊNCIA</span><span>STATUS</span></div>{visibleMaintenance.map(item => <div className="report-table__row report-table__row--maintenance" key={item.id}><strong>{item.title}</strong><span>{equipmentName(item.equipmentId)}</span><span>{item.dueDate}</span><span>{item.frequency}</span><StatusBadge status={item.status} /></div>)}{visibleMaintenance.length === 0 && <p className="resource-table__empty">Nenhuma preventiva corresponde ao filtro.</p>}</div>}
    </article>
  </section>
}
