import { validateCorrectiveAction } from './corrective-actions.mjs'
import { validDay, validateSchedule } from './maintenance-planning.mjs'
import { checklistCatalog } from './maintenance-checklist.mjs'
import { validateChecklist } from './maintenance-checklist.mjs'
const active = ['Ativo', 'Inativo']
const maintenance = ['Em dia', 'Atrasada', 'Crítica']
export const schemas = {
  'corrective-actions': { equipmentId: 'equipment', technicianId: 'technicians', sourceOrderId: 'service-orders' },
  clients: { name: 'string', document: 'string', contact: 'string', phone: 'string', status: active, units: 'number' },
  locations: { clientId: 'clients', name: 'string', city: 'string', address: 'string', manager: 'string', status: active },
  equipment: { tag: 'string', name: 'string', clientId: 'clients', locationId: 'locations', systemId: 'climate-systems', lastMaintenance: 'string', status: maintenance },
  'service-orders': { code: 'string', clientId: 'clients', locationId: 'locations', equipmentId: 'equipment', technicianId: 'technicians', scheduledFor: 'string', priority: ['Baixa', 'Média', 'Alta'], status: ['Agendada', 'Em andamento', 'Concluída'], description: 'string', technicalReport: 'technical-report', maintenanceId: 'optional-maintenance', maintenanceDue: 'optional-day', checklistModelId: 'optional-checklist', completedAt: 'optional-timestamp', correctiveActionId: 'optional-action' },
  maintenance: { equipmentId: 'equipment', title: 'string', dueDate: 'string', frequency: 'string', technicianId: 'technicians', status: maintenance, schedule: 'schedule' },
  technicians: { name: 'string', initials: 'string', specialty: 'string', status: active },
  'climate-systems': { name: 'string', type: ['Split', 'VRF', 'Chiller', 'Rooftop'], capacity: 'string', refrigerant: 'string' },
}
export const roles = ['Administrador', 'Gestor', 'Técnico', 'Operador']
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export function validate(resource, input, get) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Objeto inválido.')
  if (resource === 'corrective-actions') { validateCorrectiveAction(input, get); return input }
  const schema = schemas[resource]
  if (Object.keys(input).some(key => key !== 'id' && !Object.hasOwn(schema, key))) throw new HttpError(400, 'Campo desconhecido.')
  for (const [field, rule] of Object.entries(schema)) {
    const value = input[field]
    if (rule === 'schedule') { validateSchedule(value); continue }
    if (typeof rule === 'string' && rule.startsWith('optional-')) {
      if (value === undefined) continue
      if (rule === 'optional-action' && (typeof value !== 'string' || get('corrective-actions', value)?.equipmentId !== input.equipmentId) || rule === 'optional-maintenance' && (typeof value !== 'string' || !get('maintenance', value)) || rule === 'optional-day' && !validDay(value) || rule === 'optional-checklist' && !checklistCatalog.models.some(model => model.id === value) || rule === 'optional-timestamp' && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) throw new HttpError(400, `Campo inválido: ${field}`)
      continue
    }
    if (rule === 'technical-report') {
      if (value !== undefined) validateTechnicalReport(value)
      continue
    }
    if (rule === 'number') {
      if (!Number.isSafeInteger(value) || value < 0) throw new HttpError(400, `Campo inválido: ${field}`)
    } else if (typeof value !== 'string' || !value.trim() || value.length > 2000 || (Array.isArray(rule) && !rule.includes(value))) {
      throw new HttpError(400, `Campo inválido: ${field}`)
    } else if (typeof rule === 'string' && schemas[rule] && !get(rule, value)) {
      throw new HttpError(400, `Referência inexistente: ${field}`)
    }
  }
  if (input.locationId && get('locations', input.locationId)?.clientId !== input.clientId) throw new HttpError(400, 'Local não pertence ao cliente.')
  if (input.locationId && input.equipmentId && get('equipment', input.equipmentId)?.locationId !== input.locationId) throw new HttpError(400, 'Equipamento não pertence ao local.')
  if (resource === 'maintenance' && input.schedule && input.dueDate !== input.schedule.nextDue) throw new HttpError(400, 'Vencimento deve coincidir com a programação.')
  if (resource === 'service-orders' && input.maintenanceId && (get('maintenance', input.maintenanceId)?.equipmentId !== input.equipmentId || !input.maintenanceDue)) throw new HttpError(400, 'Vínculo preventivo inválido.')
  return input
}

export function validateTechnicalReport(report) {
  const allowed = ['diagnosis', 'workPerformed', 'materialsUsed', 'recommendations', 'technicianId', 'updatedAt', 'checklist']
  if (!report || typeof report !== 'object' || Array.isArray(report) || Object.keys(report).some(key => !allowed.includes(key))) throw new HttpError(400, 'Relatório técnico inválido.')
  for (const field of ['diagnosis', 'workPerformed']) {
    if (typeof report[field] !== 'string' || !report[field].trim() || report[field].length > 5000) throw new HttpError(400, `Preencha ${field === 'diagnosis' ? 'o diagnóstico' : 'o serviço executado'}.`)
  }
  for (const field of ['materialsUsed', 'recommendations']) {
    if (typeof report[field] !== 'string' || report[field].length > 5000) throw new HttpError(400, 'Relatório técnico inválido.')
  }
  validateChecklist(report.checklist)
  if (typeof report.technicianId !== 'string' || !report.technicianId.trim() || typeof report.updatedAt !== 'string' || !Number.isFinite(Date.parse(report.updatedAt))) throw new HttpError(400, 'Relatório técnico inválido.')
}
