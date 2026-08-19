import type { Client, ClimateSystem, Equipment, Location, MaintenanceItem, ServiceOrder, Technician } from '../models/operational'

export const clients: Client[] = [
  { id: 'cli-01', name: 'Clínica Vida', document: '12.345.678/0001-10', contact: 'Marina Costa', phone: '(11) 99842-1130', status: 'Ativo', units: 2 },
  { id: 'cli-02', name: 'Grupo Horizonte', document: '45.983.201/0001-42', contact: 'Rafael Lima', phone: '(11) 99125-8840', status: 'Ativo', units: 3 },
  { id: 'cli-03', name: 'Escola Integra', document: '08.193.554/0001-72', contact: 'Bianca Alves', phone: '(11) 99446-9012', status: 'Ativo', units: 1 },
  { id: 'cli-04', name: 'Mercado Nova Era', document: '67.002.119/0001-31', contact: 'Felipe Torres', phone: '(11) 98870-7721', status: 'Inativo', units: 1 },
]
export const locations: Location[] = [
  { id: 'loc-01', clientId: 'cli-01', name: 'Unidade Centro', city: 'São Paulo', address: 'Rua das Flores, 120', manager: 'Marina Costa', status: 'Ativo' },
  { id: 'loc-02', clientId: 'cli-01', name: 'Unidade Sul', city: 'São Paulo', address: 'Av. Jabaquara, 845', manager: 'Marina Costa', status: 'Ativo' },
  { id: 'loc-03', clientId: 'cli-02', name: 'Torre Sul', city: 'São Paulo', address: 'Av. Paulista, 1500', manager: 'Rafael Lima', status: 'Ativo' },
  { id: 'loc-04', clientId: 'cli-03', name: 'Bloco A', city: 'Santo André', address: 'Rua do Ensino, 77', manager: 'Bianca Alves', status: 'Ativo' },
]
export const climateSystems: ClimateSystem[] = [
  { id: 'sys-01', name: 'VRF Daikin RXYQ', type: 'VRF', capacity: '20 TR', refrigerant: 'R-410A' },
  { id: 'sys-02', name: 'Split Hi-Wall LG', type: 'Split', capacity: '24.000 BTU/h', refrigerant: 'R-32' },
  { id: 'sys-03', name: 'Chiller Carrier 30XA', type: 'Chiller', capacity: '35 TR', refrigerant: 'R-134a' },
]
export const technicians: Technician[] = [
  { id: 'tec-01', name: 'Lucas Mendes', initials: 'LM', specialty: 'VRF e Chiller', status: 'Ativo' },
  { id: 'tec-02', name: 'Ana Ribeiro', initials: 'AR', specialty: 'Split e PMOC', status: 'Ativo' },
  { id: 'tec-03', name: 'Caio Nunes', initials: 'CN', specialty: 'Elétrica', status: 'Ativo' },
]
export const equipment: Equipment[] = [
  { id: 'eq-01', tag: 'ACC-001', name: 'VRF Recepção', clientId: 'cli-01', locationId: 'loc-01', systemId: 'sys-01', lastMaintenance: '12/08/2026', status: 'Em dia' },
  { id: 'eq-02', tag: 'ACC-002', name: 'Split Consultório 04', clientId: 'cli-01', locationId: 'loc-01', systemId: 'sys-02', lastMaintenance: '05/07/2026', status: 'Crítica' },
  { id: 'eq-03', tag: 'ACC-003', name: 'Chiller Principal', clientId: 'cli-02', locationId: 'loc-03', systemId: 'sys-03', lastMaintenance: '20/06/2026', status: 'Atrasada' },
  { id: 'eq-04', tag: 'ACC-004', name: 'Split Sala dos Professores', clientId: 'cli-03', locationId: 'loc-04', systemId: 'sys-02', lastMaintenance: '15/08/2026', status: 'Em dia' },
]
export const serviceOrders: ServiceOrder[] = [
  { id: 'os-1048', code: 'OS-1048', clientId: 'cli-01', locationId: 'loc-01', equipmentId: 'eq-02', technicianId: 'tec-01', scheduledFor: '19/08 · 08:30', priority: 'Alta', status: 'Em andamento', description: 'Inspeção de falha de refrigeração.' },
  { id: 'os-1049', code: 'OS-1049', clientId: 'cli-02', locationId: 'loc-03', equipmentId: 'eq-03', technicianId: 'tec-02', scheduledFor: '19/08 · 10:00', priority: 'Média', status: 'Agendada', description: 'Manutenção preventiva mensal.' },
  { id: 'os-1050', code: 'OS-1050', clientId: 'cli-03', locationId: 'loc-04', equipmentId: 'eq-04', technicianId: 'tec-03', scheduledFor: '19/08 · 11:15', priority: 'Baixa', status: 'Concluída', description: 'Limpeza e verificação de filtros.' },
  { id: 'os-1051', code: 'OS-1051', clientId: 'cli-01', locationId: 'loc-02', equipmentId: 'eq-01', technicianId: 'tec-01', scheduledFor: '19/08 · 14:00', priority: 'Média', status: 'Agendada', description: 'Verificação de parâmetros do sistema.' },
]
export const maintenanceItems: MaintenanceItem[] = [
  { id: 'man-01', equipmentId: 'eq-02', title: 'Higienização de evaporadora', dueDate: '18/08/2026', frequency: 'Trimestral', technicianId: 'tec-01', status: 'Crítica' },
  { id: 'man-02', equipmentId: 'eq-03', title: 'Análise de óleo do chiller', dueDate: '10/08/2026', frequency: 'Mensal', technicianId: 'tec-02', status: 'Atrasada' },
  { id: 'man-03', equipmentId: 'eq-01', title: 'Checklist PMOC', dueDate: '25/08/2026', frequency: 'Mensal', technicianId: 'tec-03', status: 'Em dia' },
  { id: 'man-04', equipmentId: 'eq-04', title: 'Limpeza de filtros', dueDate: '28/08/2026', frequency: 'Trimestral', technicianId: 'tec-02', status: 'Em dia' },
]
