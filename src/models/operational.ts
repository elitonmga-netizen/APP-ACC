export type EntityStatus = 'Ativo' | 'Inativo' | 'Agendada' | 'Em andamento' | 'Concluída' | 'Atrasada' | 'Crítica' | 'Em dia'

export type Client = { id: string; name: string; document: string; contact: string; phone: string; status: 'Ativo' | 'Inativo'; units: number }
export type Location = { id: string; clientId: string; name: string; city: string; address: string; manager: string; status: 'Ativo' | 'Inativo' }
export type ClimateSystem = { id: string; name: string; type: 'Split' | 'VRF' | 'Chiller' | 'Rooftop'; capacity: string; refrigerant: string }
export type Equipment = { id: string; tag: string; name: string; clientId: string; locationId: string; systemId: string; lastMaintenance: string; status: 'Em dia' | 'Crítica' | 'Atrasada' }
export type Technician = { id: string; name: string; initials: string; specialty: string; status: 'Ativo' | 'Inativo' }
export type ServiceOrder = { id: string; code: string; clientId: string; locationId: string; equipmentId: string; technicianId: string; scheduledFor: string; priority: 'Baixa' | 'Média' | 'Alta'; status: 'Agendada' | 'Em andamento' | 'Concluída'; description: string }
export type MaintenanceItem = { id: string; equipmentId: string; title: string; dueDate: string; frequency: string; technicianId: string; status: 'Em dia' | 'Atrasada' | 'Crítica' }
