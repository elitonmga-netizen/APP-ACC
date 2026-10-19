import { evidenceChecklist } from './fixtures/report-evidence.mjs'
import { checklistCatalog } from './maintenance-checklist.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openDatabase } from './database.mjs'
import { seedRecords } from './seed.mjs'
import { createUser } from './auth.mjs'
import { syncOfflineOrder } from './offline-sync.mjs'

test('offline: sincronização atômica, recibo idempotente, conflitos e isolamento do técnico', async () => {
  const store = openDatabase(':memory:')
  try {
    seedRecords(store)
    const order = store.list('service-orders').find(item => item.status === 'Agendada')
    const account = await createUser(store.db, { name: 'Teste offline', email: 'offline@example.test', password: 'Test-password-offline-only!', role: 'Técnico', technicianId: order.technicianId })
    const user = { ...account, technician_id: order.technicianId }
const model = checklistCatalog.models.find(item => item.id === 'fancoil')
    const checklist = { version: 1, modelId: model.id, items: Object.fromEntries(model.items.map(item => [item.id, { status: 'Não conforme', notes: 'Revisar correia e mancais' }])), measurements: { voltage: 220, current: 0, returnAir: 25.5, supplyAir: 14, waterIn: 7, waterOut: 12 } }
        Object.assign(checklist, evidenceChecklist())
    const input = { operationId: randomUUID(), base: { status: order.status, reportUpdatedAt: '' }, status: 'Concluída', report: { checklist, diagnosis: 'Filtro sujo', workPerformed: 'Limpeza e teste', materialsUsed: '', recommendations: '' }, photos: [{ stage: 'Antes', caption: '', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==' }] }
    assert.throws(() => syncOfflineOrder(store, { ...user, technician_id: 'other-tech' }, order.id, input), { status: 404 })
    assert.throws(() => syncOfflineOrder(store, { ...user, role: 'Operador' }, order.id, input), { status: 403 })
    assert.throws(() => syncOfflineOrder(store, user, order.id, { ...input, base: { ...input.base, status: 'Em andamento' } }), { status: 409 })
    assert.throws(() => syncOfflineOrder(store, user, order.id, { ...input, photos: [{ stage: 'Antes', caption: '', data: 'data:text/html;base64,AAA' }] }), { status: 400 })
    assert.equal(store.get('service-orders', order.id).status, 'Agendada')
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM offline_receipts').get().n, 0)
    assert.throws(() => syncOfflineOrder(store, user, order.id, { ...input, report: { ...input.report, checklist: { ...checklist, measurements: { waterIn: 999 } } } }), { status: 400 })
    const saved = syncOfflineOrder(store, user, order.id, input)
    assert.equal(saved.status, 'Concluída')
    assert.deepEqual(saved.technicalReport.checklist, checklist)
    assert.equal(saved.technicalReport.diagnosis, 'Filtro sujo')
    assert.deepEqual(syncOfflineOrder(store, user, order.id, input), saved)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM order_photos').get().n, 1)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM offline_receipts').get().n, 1)
    assert.throws(() => syncOfflineOrder(store, user, order.id, { ...input, status: 'Em andamento' }), { status: 409 })
    assert.throws(() => syncOfflineOrder(store, user, order.id, { ...input, operationId: randomUUID() }), { status: 409 })
    const next = { ...input, operationId: randomUUID(), base: { status: saved.status, reportUpdatedAt: saved.technicalReport.updatedAt }, photos: Array(12).fill(input.photos[0]) }
    assert.throws(() => syncOfflineOrder(store, user, order.id, next), { status: 409 })
    assert.deepEqual(store.get('service-orders', order.id), saved)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM order_photos').get().n, 1)
  } finally { store.db.close() }
})
