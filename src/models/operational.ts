export type EntityStatus = 'Ativo' | 'Inativo' | 'Agendada' | 'Em andamento' | 'Concluída' | 'Atrasada' | 'Crítica' | 'Em dia'

export type Client = { id: string; name: string; document: string; contact: string; phone: string; status: 'Ativo' | 'Inativo'; units: number }
export type Location = { id: string; clientId: string; name: string; city: string; address: string; manager: string; status: 'Ativo' | 'Inativo' }
export type ClimateSystem = { id: string; name: string; type: 'Split' | 'VRF' | 'Chiller' | 'Rooftop'; capacity: string; refrigerant: string }
export type Equipment = { id: string; tag: string; name: string; clientId: string; locationId: string; systemId: string; lastMaintenance: string; status: 'Em dia' | 'Crítica' | 'Atrasada' }
export type Technician = { id: string; name: string; initials: string; specialty: string; status: 'Ativo' | 'Inativo' }
export type ChecklistStatus = 'Pendente' | 'Conforme' | 'Não conforme' | 'Não se aplica'
export type ChecklistPhoto = { id: string; data: string; caption: string }
export type ElectricalComponent = { id: string; kind: string; label: string; supply: 'mono' | 'tri'; readings: Record<string, number>; notes: string }
export type RefrigerantCircuit = { id: string; label: string; unit: 'bar' | 'psi' | 'MPa'; high?: number; low?: number; notes: string }
export type MaintenanceChecklist = { version: 1; modelId: string; items: Record<string, { status: ChecklistStatus; notes: string; photos?: ChecklistPhoto[] }>; measurements: Record<string, number>; components?: ElectricalComponent[]; circuits?: RefrigerantCircuit[] }
export type TechnicalReportInput = Pick<TechnicalReport, 'diagnosis' | 'workPerformed' | 'materialsUsed' | 'recommendations' | 'checklist'>
export type TechnicalReport = { checklist?: MaintenanceChecklist | null; diagnosis: string; workPerformed: string; materialsUsed: string; recommendations: string; technicianId: string; updatedAt: string }
export type MaintenanceSchedule = { interval: number; unit: 'days' | 'months'; nextDue: string; anchorDay: number; checklistModelId: string }
export type ServiceOrder = { maintenanceId?: string; maintenanceDue?: string; checklistModelId?: string; completedAt?: string; id: string; code: string; clientId: string; locationId: string; equipmentId: string; technicianId: string; scheduledFor: string; priority: 'Baixa' | 'Média' | 'Alta'; status: 'Agendada' | 'Em andamento' | 'Concluída'; description: string; technicalReport?: TechnicalReport }
export type MaintenanceItem = { schedule?: MaintenanceSchedule | null; id: string; equipmentId: string; title: string; dueDate: string; frequency: string; technicianId: string; status: 'Em dia' | 'Atrasada' | 'Crítica' }
