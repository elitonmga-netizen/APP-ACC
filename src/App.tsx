import { SessionGate } from './components/SessionGate'
import { useSessionUser } from './components/session-context'
import { apiEnabled } from './services/api'
import { useState } from 'react'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { ResourceScreen } from './components/operations/ResourceScreen'
import { AdminScreen } from './components/operations/AdminScreen'
import { MetricCard } from './components/ui/MetricCard'
import { StatusBadge } from './components/ui/StatusBadge'
import { clientConfig, equipmentConfig, locationConfig, maintenanceConfig, orderConfig, systemConfig, technicianConfig } from './config/resource-configs'
import { navigationItems } from './data/dashboard'
import { clients, equipment, locations, maintenanceItems, serviceOrders } from './mocks/operational'
const clientName = (id: string) => clients.find((item) => item.id === id)?.name ?? '—'; const locationName = (id: string) => locations.find((item) => item.id === id)?.name ?? '—'
function Dashboard({ onNavigate }: { onNavigate: (item: string) => void }) {
  const activeOrders = serviceOrders.filter((order) => order.status !== 'Concluída')
  const inProgress = serviceOrders.filter((order) => order.status === 'Em andamento').length
  const attentionEquipment = equipment.filter((item) => item.status !== 'Em dia').length
  const completedMaintenance = maintenanceItems.filter((item) => item.status === 'Em dia').length
  const maintenanceRate = maintenanceItems.length ? Math.round((completedMaintenance / maintenanceItems.length) * 100) : 0
  const pendingMaintenance = maintenanceItems.length - completedMaintenance
  const activeClients = clients.filter((client) => client.status === 'Ativo').length

  return <>
    <section className="metric-grid">
      <MetricCard label="Ordens abertas" value={String(activeOrders.length)} helper="Atendimentos pendentes" trend={activeOrders.length ? 'warning' : 'positive'} />
      <MetricCard label="Em atendimento" value={String(inProgress)} helper="Equipe em campo" trend="positive" />
      <MetricCard label="Equipamentos em atenção" value={String(attentionEquipment)} helper="Críticos ou atrasados" trend={attentionEquipment ? 'warning' : 'positive'} />
      <MetricCard label="Preventivas em dia" value={`${maintenanceRate}%`} helper="Plano de manutenção" trend={pendingMaintenance ? 'warning' : 'positive'} />
    </section>
    <section className="dashboard-grid">
      <article className="panel panel--orders">
        <div className="panel__header"><div><h2>Ordens de serviço</h2><p>Acompanhe os atendimentos e seus status.</p></div><button className="text-button" onClick={() => onNavigate('Ordens de Serviço')}>Ver todas →</button></div>
        <div className="orders-table" role="table">
          <div className="orders-table__header" role="row"><span>ORDEM</span><span>CLIENTE / LOCAL</span><span>AGENDAMENTO</span><span>STATUS</span></div>
          {serviceOrders.map((order) => <div className="orders-table__row" role="row" key={order.id}><b>{order.code}</b><span><strong>{clientName(order.clientId)}</strong><small>{locationName(order.locationId)}</small></span><span>{order.scheduledFor.split('· ')[1] ?? order.scheduledFor}</span><StatusBadge status={order.status} /></div>)}
        </div>
      </article>
      <article className="panel panel--focus">
        <div className="panel__header"><div><h2>Foco da semana</h2><p>Prioridades para a operação.</p></div></div>
        <div className="focus-card"><span className="focus-card__icon">↻</span><div><b>Preventivas pendentes</b><p>{pendingMaintenance} itens precisam de acompanhamento.</p><button className="text-button" onClick={() => onNavigate('Manutenção')}>Abrir manutenção →</button></div></div>
        <div className="progress-label"><span>Conformidade preventiva</span><b>{maintenanceRate}%</b></div>
        <div className="progress"><span style={{ width: `${maintenanceRate}%` }} /></div>
        <div className="mini-stats"><div><b>{activeClients}</b><span>Clientes ativos</span></div><div><b>{locations.length}</b><span>Locais atendidos</span></div></div>
      </article>
    </section>
  </>
}
function ComingSoon({ title }: { title: string }) { return <section className="empty-state"><span>◫</span><h2>{title}</h2><p>Este módulo permanece preparado na navegação e será desenvolvido nas próximas sprints.</p></section> }
function OperationalApp() { const user = useSessionUser(); const [activeItem, setActiveItem] = useState('Dashboard'); const [isMenuOpen, setMenuOpen] = useState(false); const admin = apiEnabled && (!user || user.role === 'Administrador'); const manager = !apiEnabled || admin || user?.role === 'Gestor'; const items = navigationItems.filter(item => (item.label !== 'Usuários' && item.label !== 'Auditoria' || admin) && (item.label !== 'Técnicos' && item.label !== 'Sistemas' || manager)); let content = <ComingSoon title={activeItem} />; if (activeItem === 'Dashboard') content = <Dashboard onNavigate={setActiveItem} />; if (activeItem === 'Clientes') content = <ResourceScreen key={activeItem} config={clientConfig} />; if (activeItem === 'Locais') content = <ResourceScreen key={activeItem} config={locationConfig} />; if (activeItem === 'Equipamentos') content = <ResourceScreen key={activeItem} config={equipmentConfig} />; if (activeItem === 'Ordens de Serviço') content = <ResourceScreen key={activeItem} config={orderConfig} />; if (activeItem === 'Manutenção') content = <ResourceScreen key={activeItem} config={maintenanceConfig} />; if (activeItem === 'Técnicos') content = <ResourceScreen key={activeItem} config={technicianConfig} />; if (activeItem === 'Sistemas') content = <ResourceScreen key={activeItem} config={systemConfig} />; if (activeItem === 'Usuários' || activeItem === 'Auditoria') content = <AdminScreen key={activeItem} view={activeItem} />; return <div className="app-shell"><Sidebar items={items} activeItem={activeItem} onNavigate={setActiveItem} isOpen={isMenuOpen} onClose={() => setMenuOpen(false)} /><div className="app-content"><Header onMenuClick={() => setMenuOpen(true)} /><main><section className="page-heading"><div><p className="eyebrow">ACC CLIMATIZAÇÃO · NÚCLEO OPERACIONAL</p><h1>{activeItem}</h1><span>Controle simples para operações que não podem parar.</span></div>{activeItem === 'Dashboard' && <button className="primary-button" onClick={() => setActiveItem('Ordens de Serviço')}>+ Nova ordem de serviço</button>}</section>{content}</main></div></div> }
export default function App() { return apiEnabled ? <SessionGate><OperationalApp /></SessionGate> : <OperationalApp /> }
