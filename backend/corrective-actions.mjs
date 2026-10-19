import { createHash, randomUUID } from 'node:crypto'
import { HttpError } from './schema.mjs'
import { checklistCatalog, validJpeg } from './maintenance-checklist.mjs'
import { localDay, validDay } from './maintenance-planning.mjs'
const states = ['Aberta', 'Em correção', 'Aguardando validação', 'Resolvida']
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || !!value.trim())
const dateTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
export function validateCorrectiveAction(value, get) {
  const fail = () => { throw new HttpError(400, 'Pendência corretiva inválida.') }
  const keys = ['id', 'code', 'equipmentId', 'technicianId', 'sourceOrderId', 'sourceOrderCode', 'sourceModelId', 'sourceItemId', 'sourceLabel', 'evidence', 'priority', 'dueDate', 'status', 'createdAt', 'updatedAt', 'correctiveOrderId', 'feedback', 'resolution']
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key)) || !text(value.id, 100, true) || !text(value.code, 100, true) || !text(value.sourceOrderId, 2000, true) || !text(value.equipmentId, 2000, true) || !text(value.technicianId, 2000, true) || value.correctiveOrderId !== undefined && !text(value.correctiveOrderId, 2000, true) || !text(value.sourceOrderCode, 2000, true) || !text(value.sourceLabel, 200, true) || !states.includes(value.status) || !['Baixa', 'Média', 'Alta'].includes(value.priority) || value.dueDate !== '' && !validDay(value.dueDate) || !dateTime(value.createdAt) || !dateTime(value.updatedAt)) fail()
  const source = get('service-orders', value.sourceOrderId)
  const model = checklistCatalog.models.find(item => item.id === value.sourceModelId)
  if (!source || source.equipmentId !== value.equipmentId || !get('equipment', value.equipmentId) || !get('technicians', value.technicianId) || !model?.items.some(item => item.id === value.sourceItemId)) fail()
  if (!object(value.evidence) || Object.keys(value.evidence).some(key => !['notes', 'photos'].includes(key)) || !text(value.evidence.notes, 1000) || !Array.isArray(value.evidence.photos) || value.evidence.photos.length > 2) fail()
  for (const photo of value.evidence.photos) if (!object(photo) || Object.keys(photo).some(key => !['id', 'caption', 'data'].includes(key)) || !text(photo.id, 100, true) || !text(photo.caption, 300) || !validJpeg(photo.data)) fail()
  if (value.correctiveOrderId !== undefined) {
    const order = get('service-orders', value.correctiveOrderId)
    if (!order || order.correctiveActionId !== value.id || order.equipmentId !== value.equipmentId) fail()
  }
  if (value.feedback !== undefined && !text(value.feedback, 5000)) fail()
  if (value.resolution !== undefined) {
    const result = value.resolution
    if (!object(result) || Object.keys(result).some(key => !['notes', 'validatedAt', 'validatedBy', 'orderId'].includes(key)) || !text(result.notes, 5000, true) || !dateTime(result.validatedAt) || !text(result.validatedBy, 100, true) || result.orderId !== value.correctiveOrderId || get('service-orders', result.orderId)?.status !== 'Concluída') fail()
  }
  if (value.status !== 'Aberta' && !value.correctiveOrderId || value.status === 'Resolvida' && !value.resolution) fail()
}
export function captureNonconformities(store, order, actorId) {
  const checklist = order.technicalReport?.checklist
  const model = checklistCatalog.models.find(item => item.id === checklist?.modelId)
  if (!model) return 0
  let created = 0
  for (const item of model.items) {
    const entry = checklist.items[item.id]
    if (entry?.status !== 'Não conforme') continue
    const hash = createHash('sha256').update(JSON.stringify([order.id, model.id, item.id])).digest('hex')
    const id = `ca-${hash}`
    if (store.get('corrective-actions', id)) continue
    const now = new Date().toISOString()
    store.save('corrective-actions', { id, code: `PEND-${hash.slice(0, 8).toUpperCase()}`, equipmentId: order.equipmentId, technicianId: order.technicianId, sourceOrderId: order.id, sourceOrderCode: order.code, sourceModelId: model.id, sourceItemId: item.id, sourceLabel: item.label, evidence: { notes: entry.notes, photos: entry.photos || [] }, priority: 'Média', dueDate: '', status: 'Aberta', createdAt: now, updatedAt: now }, false, actorId)
    created++
  }
  return created
}
export function completeCorrectiveOrder(store, order, actorId) {
  const action = store.get('corrective-actions', order.correctiveActionId)
  if (!action || action.correctiveOrderId !== order.id || action.status !== 'Em correção') throw new HttpError(409, 'O vínculo da correção mudou. Revise a pendência antes de concluir.')
  if (!order.technicalReport?.workPerformed?.trim()) throw new HttpError(409, 'Preencha o relatório da solução antes de concluir a OS corretiva.')
  store.save('corrective-actions', { ...action, status: 'Aguardando validação', updatedAt: new Date().toISOString() }, true, actorId)
}
export function generateCorrectiveOrder(store, user, id) {
  manager(user)
  store.db.exec('BEGIN IMMEDIATE')
  try {
    const action = store.get('corrective-actions', id)
    if (!action) throw new HttpError(404, 'Pendência inexistente.')
    if (action.status === 'Em correção' && action.correctiveOrderId) { const order = store.get('service-orders', action.correctiveOrderId); store.db.exec('COMMIT'); return { order, created: false } }
    if (action.status !== 'Aberta') throw new HttpError(409, 'Esta pendência não está aberta para gerar uma OS.')
    if (!action.dueDate || store.get('technicians', action.technicianId)?.status !== 'Ativo') throw new HttpError(409, 'Defina prazo e técnico ativo antes de gerar a OS corretiva.')
    const equipment = store.get('equipment', action.equipmentId)
    const orderId = randomUUID()
    const order = store.save('service-orders', { id: orderId, code: `OS-COR-${orderId.slice(0, 8).toUpperCase()}`, equipmentId: equipment.id, clientId: equipment.clientId, locationId: equipment.locationId, technicianId: action.technicianId, description: `Corrigir ${action.sourceLabel}. Origem: ${action.sourceOrderCode}. ${action.evidence.notes}`.slice(0, 2000), priority: action.priority, scheduledFor: action.dueDate, status: 'Agendada', checklistModelId: action.sourceModelId, correctiveActionId: action.id }, false, user.id)
    store.save('corrective-actions', { ...action, correctiveOrderId: order.id, status: 'Em correção', updatedAt: new Date().toISOString() }, true, user.id)
    store.db.exec('COMMIT'); return { order, created: true }
  } catch (error) { store.db.exec('ROLLBACK'); throw error }
}
export function manager(user) { if (!['Administrador', 'Gestor'].includes(user.role)) throw new HttpError(403, 'Apenas administrador ou gestor pode gerenciar pendências.') }
export function configureAction(store, user, id, input) {
  manager(user)
  const action = store.get('corrective-actions', id)
  if (!action) throw new HttpError(404, 'Pendência inexistente.')
  if (action.status !== 'Aberta') throw new HttpError(409, 'Edite responsável e prazo antes de gerar a OS.')
  if (!object(input) || Object.keys(input).some(key => !['technicianId', 'priority', 'dueDate'].includes(key))) throw new HttpError(400, 'Altere somente responsável, prioridade e prazo.')
  return store.save('corrective-actions', { ...action, ...input, updatedAt: new Date().toISOString() }, true, user.id)
}
export function reviewAction(store, user, id, input) {
  manager(user)
  const action = store.get('corrective-actions', id)
  if (!action) throw new HttpError(404, 'Pendência inexistente.')
  if (!object(input) || Object.keys(input).some(key => !['decision', 'notes'].includes(key)) || !['resolve', 'rework'].includes(input.decision) || !text(input.notes, 5000, true)) throw new HttpError(400, 'Informe a decisão e as observações da validação.')
  if (action.status === 'Resolvida' && input.decision === 'resolve') return action
  if (action.status !== 'Aguardando validação') throw new HttpError(409, 'Aguarde a conclusão da OS corretiva antes de validar.')
  const order = store.get('service-orders', action.correctiveOrderId)
  if (order?.status !== 'Concluída' || !order.technicalReport?.workPerformed?.trim()) throw new HttpError(409, 'A solução deve estar registrada em uma OS concluída.')
  const now = new Date().toISOString()
  return store.save('corrective-actions', { ...action, status: input.decision === 'resolve' ? 'Resolvida' : 'Aberta', updatedAt: now, feedback: input.notes, ...(input.decision === 'resolve' ? { resolution: { notes: input.notes, validatedAt: now, validatedBy: user.id, orderId: order.id } } : {}) }, true, user.id)
}
export function correctiveSummary(items, today = localDay()) { return { open: items.filter(item => item.status !== 'Resolvida').length, overdue: items.filter(item => item.status !== 'Resolvida' && item.dueDate && item.dueDate < today).length, unplanned: items.filter(item => item.status !== 'Resolvida' && !item.dueDate).length, awaiting: items.filter(item => item.status === 'Aguardando validação').length } }
