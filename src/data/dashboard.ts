import type { NavigationItem, ServiceOrder } from '../types/dashboard'

export const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', icon: '▦' }, { label: 'Clientes', icon: '♙' }, { label: 'Locais', icon: '⌖' }, { label: 'Equipamentos', icon: '▣' },
  { label: 'Ordens de Serviço', icon: '✓' }, { label: 'Manutenção', icon: '↻' }, { label: 'Relatórios', icon: '◫' }, { label: 'Configurações', icon: '⚙' },
]
export const serviceOrders: ServiceOrder[] = [
  { id: 'OS-1048', client: 'Clínica Vida', location: 'Unidade Centro', status: 'Em andamento', time: '08:30' },
  { id: 'OS-1049', client: 'Grupo Horizonte', location: 'Torre Sul', status: 'Agendada', time: '10:00' },
  { id: 'OS-1050', client: 'Escola Integra', location: 'Bloco A', status: 'Concluída', time: '11:15' },
  { id: 'OS-1051', client: 'Mercado Nova Era', location: 'Loja Norte', status: 'Agendada', time: '14:00' },
]
