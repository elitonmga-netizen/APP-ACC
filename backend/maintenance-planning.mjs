import { randomUUID } from 'node:crypto'
import { HttpError } from './schema.mjs'
import { checklistCatalog } from './maintenance-checklist.mjs'
export const planningFields = ['maintenanceId', 'maintenanceDue', 'checklistModelId', 'completedAt', 'correctiveActionId']
export function validDay(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '1900-01-01') return false
  const date = new Date(`${day}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}
export function localDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function validateSchedule(schedule) {
  if (schedule === undefined || schedule === null) return
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule) || Object.keys(schedule).some(key => !['interval', 'unit', 'nextDue', 'anchorDay', 'checklistModelId'].includes(key)) || !Number.isInteger(schedule.interval) || schedule.interval < 1 || schedule.interval > (schedule.unit === 'months' ? 120 : 3650) || !['months', 'days'].includes(schedule.unit) || !validDay(schedule.nextDue) || !Number.isInteger(schedule.anchorDay) || schedule.anchorDay < 1 || schedule.anchorDay > 31 || !checklistCatalog.models.some(model => model.id === schedule.checklistModelId)) throw new HttpError(400, 'Programação inválida: informe data, periodicidade e checklist.')
}
export function maintenanceStatus(item, today = localDay()) {
  if (!item.schedule) return item.status
  return item.schedule.nextDue < today ? 'Atrasada' : item.schedule.nextDue === today ? 'Crítica' : 'Em dia'
}
export function nextMaintenanceDue(due, schedule, completedDay) {
  if (!validDay(due) || !validDay(completedDay)) throw new HttpError(400, 'Data inválida para recorrência.')
  const start = new Date(`${due}T12:00:00Z`), end = new Date(`${completedDay}T12:00:00Z`)
  let result
  if (schedule.unit === 'days') {
    const steps = Math.max(1, Math.floor((end - start) / 86400000 / schedule.interval) + 1)
    result = new Date(start.getTime() + steps * schedule.interval * 86400000)
  } else {
    const delta = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()
    const steps = Math.max(1, Math.floor(delta / schedule.interval))
    const candidate = count => {
      const date = new Date(start); date.setUTCDate(1); date.setUTCMonth(start.getUTCMonth() + count * schedule.interval)
      const last = new Date(date); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0)
      date.setUTCDate(Math.min(schedule.anchorDay, last.getUTCDate()))
      return date
    }
    result = candidate(steps)
    if (result <= end) result = candidate(steps + 1)
  }
  const day = result.toISOString().slice(0, 10)
  if (!validDay(day)) throw new HttpError(400, 'Próxima data fora do intervalo suportado.')
  return day
}
export function generatePreventiveOrder(store, user, maintenanceId) {
  if (!['Administrador', 'Gestor'].includes(user.role)) throw new HttpError(403, 'Apenas administrador ou gestor pode gerar OS preventiva.')
  store.db.exec('BEGIN IMMEDIATE')
  try {
    const item = store.get('maintenance', maintenanceId)
    if (!item) throw new HttpError(404, 'Preventiva inexistente.')
    if (!item.schedule) throw new HttpError(409, 'Programe a periodicidade e o checklist antes de gerar a OS.')
    const related = store.list('service-orders').filter(order => order.maintenanceId === item.id)
    const active = related.find(order => order.status !== 'Concluída')
    if (active) { store.db.exec('COMMIT'); return { order: active, created: false } }
    if (related.some(order => order.maintenanceDue === item.schedule.nextDue)) throw new HttpError(409, 'Este ciclo já foi executado. Revise a próxima data da preventiva.')
    const equipment = store.get('equipment', item.equipmentId)
    if (!equipment || store.get('technicians', item.technicianId)?.status !== 'Ativo') throw new HttpError(409, 'Confira o equipamento e o técnico ativo antes de gerar a OS.')
    const id = randomUUID()
    const order = store.save('service-orders', { id, code: `OS-PREV-${item.schedule.nextDue.replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`, clientId: equipment.clientId, locationId: equipment.locationId, equipmentId: equipment.id, technicianId: item.technicianId, scheduledFor: item.schedule.nextDue, priority: 'Média', status: 'Agendada', description: item.title, maintenanceId: item.id, maintenanceDue: item.schedule.nextDue, checklistModelId: item.schedule.checklistModelId }, false, user.id)
    store.db.exec('COMMIT')
    return { order, created: true }
  } catch (error) { store.db.exec('ROLLBACK'); throw error }
}
