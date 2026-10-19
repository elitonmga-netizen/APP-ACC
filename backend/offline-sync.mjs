import { randomUUID, createHash } from 'node:crypto'
import { HttpError, validateTechnicalReport } from './schema.mjs'
export function validatePhoto(input) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['stage', 'caption', 'data'].includes(key)) || !['Antes', 'Depois'].includes(input.stage) || typeof input.caption !== 'string' || input.caption.length > 300 || typeof input.data !== 'string') throw new HttpError(400, 'Foto inválida.')
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.data)
  const image = match && Buffer.from(match[1], 'base64')
  if (!image || image.length > 614400 || image.length < 4 || image[0] !== 255 || image[1] !== 216 || image[2] !== 255 || image.at(-2) !== 255 || image.at(-1) !== 217 || image.toString('base64') !== match[1]) throw new HttpError(400, 'Envie uma imagem JPEG de até 600 KB.')
}
export function syncOfflineOrder(store, user, orderId, input) {
  const { db } = store
  const order = store.get('service-orders', orderId)
  if (user.role !== 'Técnico') throw new HttpError(403, 'Sincronização disponível apenas para técnicos.')
  if (!order || order.technicianId !== user.technician_id) throw new HttpError(404, 'Ordem não está mais atribuída a você. Rascunho preservado no celular.')
  if (!input || Object.keys(input).some(key => !['operationId', 'base', 'status', 'report', 'photos'].includes(key)) || typeof input.operationId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.operationId) || !input.base || typeof input.base !== 'object' || Array.isArray(input.base) || Object.keys(input.base).some(key => !['status', 'reportUpdatedAt'].includes(key)) || typeof input.base.status !== 'string' || typeof input.base.reportUpdatedAt !== 'string' || !Array.isArray(input.photos) || input.photos.length > 12) throw new HttpError(400, 'Rascunho inválido.')
  input.photos.forEach(validatePhoto)
  const hash = createHash('sha256').update(JSON.stringify({ orderId, input })).digest('hex')
  const receipt = db.prepare('SELECT * FROM offline_receipts WHERE operation_id=?').get(input.operationId)
  if (receipt) {
    if (receipt.user_id !== user.id || receipt.request_hash !== hash) throw new HttpError(409, 'Identificador de sincronização já utilizado.')
    return JSON.parse(receipt.result)
  }
  if (order.status !== input.base.status || (order.technicalReport?.updatedAt || '') !== input.base.reportUpdatedAt) throw new HttpError(409, 'A OS mudou no servidor. Rascunho preservado; revise antes de descartar ou reenviar.')
  const next = { ...order }
  if (input.status !== undefined) {
    const transitions = { Agendada: ['Agendada', 'Em andamento', 'Concluída'], 'Em andamento': ['Em andamento', 'Concluída'], 'Concluída': ['Concluída'] }
    if (!transitions[order.status]?.includes(input.status)) throw new HttpError(400, 'Transição de status inválida.')
    next.status = input.status
  }
  if (input.report !== undefined) {
    const fields = ['diagnosis', 'workPerformed', 'materialsUsed', 'recommendations', 'checklist']
    if (!input.report || Object.keys(input.report).some(key => !fields.includes(key))) throw new HttpError(400, 'Relatório inválido.')
    next.technicalReport = { ...(order.technicalReport?.checklist !== undefined ? { checklist: order.technicalReport.checklist } : {}), ...input.report, technicianId: user.technician_id, updatedAt: new Date().toISOString() }
    validateTechnicalReport(next.technicalReport)
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    if (db.prepare('SELECT COUNT(*) AS count FROM order_photos WHERE order_id=?').get(orderId).count + input.photos.length > 12) throw new HttpError(409, 'O limite de 12 fotos foi atingido. Rascunho preservado.')
    store.save('service-orders', next, true, user.id)
    for (const photo of input.photos) db.prepare('INSERT INTO order_photos(id,order_id,stage,caption,data,created_at,user_id) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), orderId, photo.stage, photo.caption.trim(), photo.data, new Date().toISOString(), user.id)
    db.prepare('INSERT INTO offline_receipts VALUES(?,?,?,?,?)').run(input.operationId, user.id, hash, JSON.stringify(next), new Date().toISOString())
    db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,after_data) VALUES(?,?,?,?,?,?)').run(randomUUID(), user.id, 'offline_sync', 'service-orders', orderId, JSON.stringify({ operationId: input.operationId, photos: input.photos.length }))
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return next
}
