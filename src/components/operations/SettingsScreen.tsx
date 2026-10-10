import { useState } from 'react'
import { useSessionUser } from '../session-context'
import { apiEnabled } from '../../services/api'
import { operationalService } from '../../services/operational-service'

const preferenceKey = 'app-acc-default-report'
function downloadBackup() {
  const backup = { app: 'APP-ACC', exportedAt: new Date().toISOString(), data: {
    clients: operationalService.clients.list(), locations: operationalService.locations.list(), equipment: operationalService.equipment.list(),
    serviceOrders: operationalService.orders.list(), maintenance: operationalService.maintenance.list(), technicians: operationalService.technicians.list(), climateSystems: operationalService.systems.list(),
  } }
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `app-acc-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
}

export function SettingsScreen() {
  const user = useSessionUser()
  const [defaultReport, setDefaultReport] = useState(() => localStorage.getItem(preferenceKey) || 'Ordens de Serviço')
  const savePreference = (value: string) => { setDefaultReport(value); localStorage.setItem(preferenceKey, value) }
  return <section className="settings-grid">
    <article className="panel settings-panel"><div className="panel__header"><div><h2>Preferências</h2><p>Defina qual relatório abrir primeiro nesta conta e neste dispositivo.</p></div></div><label className="settings-field"><span>Relatório padrão</span><select value={defaultReport} onChange={event => savePreference(event.target.value)}><option>Ordens de Serviço</option><option>Manutenção preventiva</option></select></label><p className="settings-note" role="status">Preferência salva automaticamente neste dispositivo.</p></article>
    <article className="panel settings-panel"><div className="panel__header"><div><h2>Conta e ambiente</h2><p>Informações da sessão atual.</p></div></div><dl className="settings-details"><div><dt>Usuário</dt><dd>{user?.name ?? 'Modo demonstrativo'}</dd></div><div><dt>Email</dt><dd>{user?.email ?? '—'}</dd></div><div><dt>Perfil de acesso</dt><dd>{user?.role ?? 'Demonstração'}</dd></div><div><dt>Armazenamento</dt><dd>{apiEnabled ? 'API com dados persistentes' : 'Demonstração neste navegador'}</dd></div></dl></article>
    <article className="panel settings-panel settings-backup"><div className="panel__header"><div><h2>Exportação de dados</h2><p>Baixe uma cópia JSON dos cadastros atualmente carregados no sistema.</p></div></div><button className="primary-button" onClick={downloadBackup}>Baixar backup JSON</button><p className="settings-note">O arquivo inclui clientes, unidades, equipamentos, ordens, preventivas, técnicos e sistemas. Guarde-o em local seguro.</p></article>
  </section>
}
