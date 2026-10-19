import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openDatabase } from './database.mjs'
import { seedRecords } from './seed.mjs'
import { createUser } from './auth.mjs'
import { createApp } from './server.mjs'
import { evidenceChecklist } from './fixtures/report-evidence.mjs'
import { configureAction, correctiveSummary, generateCorrectiveOrder, reviewAction } from './corrective-actions.mjs'
import { syncOfflineOrder } from './offline-sync.mjs'
const report = technicianId => ({ diagnosis: 'Inspeção', workPerformed: 'Inspeção concluída', materialsUsed: '', recommendations: '', technicianId, updatedAt: new Date().toISOString(), checklist: evidenceChecklist() })
const account = (store, role, technicianId) => createUser(store.db, { name: role, role, email: `${randomUUID()}@example.test`, password: 'Test-corrective-actions-123!', ...(role === 'Técnico' ? { technicianId } : {}) })

test('corretivas: evidência preservada, sem duplicação, prazo, OS idempotente e validação com retrabalho', async () => {
  const store = openDatabase(':memory:')
  try {
    seedRecords(store)
    const source = store.list('service-orders')[0]
    const admin = await account(store, 'Administrador'), tech = await account(store, 'Técnico', source.technicianId)
    const updated = store.save('service-orders', { ...source, technicalReport: report(source.technicianId) }, true, tech.id)
    const action = store.list('corrective-actions')[0]
    assert.equal(store.list('corrective-actions').length, 1)
    assert.equal(action.sourceItemId, 'filters'); assert.equal(action.sourceLabel, 'Filtros de ar')
    assert.deepEqual(action.evidence.photos, updated.technicalReport.checklist.items.filters.photos)
    store.save('service-orders', updated, true, tech.id)
    assert.equal(store.list('corrective-actions').length, 1)
    const revised = structuredClone(updated); revised.technicalReport.checklist.items.filters = { status: 'Conforme', notes: 'Revisão do texto', photos: [] }
    store.save('service-orders', revised, true, tech.id)
    assert.deepEqual(store.get('corrective-actions', action.id), action)
    assert.throws(() => generateCorrectiveOrder(store, tech, action.id), { status: 403 })
    assert.throws(() => generateCorrectiveOrder(store, admin, action.id), { status: 409 })
    configureAction(store, admin, action.id, { dueDate: '2026-01-01', priority: 'Alta' })
    assert.equal(correctiveSummary(store.list('corrective-actions'), '2026-01-02').overdue, 1)
    const first = generateCorrectiveOrder(store, admin, action.id)
    assert.equal(first.created, true); assert.equal(first.order.correctiveActionId, action.id)
    assert.equal(first.order.technicianId, source.technicianId); assert.equal(first.order.priority, 'Alta')
    assert.equal(generateCorrectiveOrder(store, admin, action.id).order.id, first.order.id)
    assert.equal(generateCorrectiveOrder(store, admin, action.id).created, false)
    assert.throws(() => configureAction(store, admin, action.id, { priority: 'Baixa' }), { status: 409 })
    assert.throws(() => store.save('service-orders', { ...first.order, status: 'Concluída' }, true, tech.id), { status: 409 })
    assert.equal(store.get('service-orders', first.order.id).status, 'Agendada')
    const user = { ...tech, technician_id: source.technicianId }
    const payload = { operationId: randomUUID(), base: { status: 'Agendada', reportUpdatedAt: '' }, status: 'Concluída', photos: [], report: { diagnosis: 'Filtro danificado', workPerformed: 'Filtro substituído e funcionamento testado', materialsUsed: 'Filtro novo', recommendations: '' } }
    const completed = syncOfflineOrder(store, user, first.order.id, payload)
    assert.equal(store.get('corrective-actions', action.id).status, 'Aguardando validação')
    assert.deepEqual(syncOfflineOrder(store, user, first.order.id, payload), completed)
    assert.throws(() => reviewAction(store, tech, action.id, { decision: 'resolve', notes: 'OK' }), { status: 403 })
    assert.throws(() => reviewAction(store, admin, action.id, { decision: 'resolve', notes: '' }), { status: 400 })
    reviewAction(store, admin, action.id, { decision: 'rework', notes: 'Realizar novo teste' })
    assert.equal(store.get('corrective-actions', action.id).status, 'Aberta')
    const second = generateCorrectiveOrder(store, admin, action.id)
    assert.notEqual(second.order.id, first.order.id)
    const solution = { ...report(source.technicianId), checklist: null, workPerformed: 'Novo teste executado e solução confirmada' }
    store.save('service-orders', { ...second.order, technicalReport: solution, status: 'Concluída' }, true, tech.id)
    const resolved = reviewAction(store, admin, action.id, { decision: 'resolve', notes: 'Correção verificada e aprovada' })
    assert.equal(resolved.status, 'Resolvida'); assert.equal(resolved.resolution.orderId, second.order.id)
    assert.equal(correctiveSummary(store.list('corrective-actions')).open, 0)
    assert.deepEqual(reviewAction(store, admin, action.id, { decision: 'resolve', notes: 'Repetição da confirmação' }), resolved)
    store.save('service-orders', updated, true, tech.id)
    assert.equal(store.list('corrective-actions').length, 1)
    assert.equal(store.get('corrective-actions', action.id).status, 'Resolvida')
    assert.throws(() => store.remove('corrective-actions', action.id, admin.id), { status: 409 })
    assert.throws(() => store.remove('service-orders', second.order.id, admin.id), { status: 409 })
    assert.throws(() => store.save('service-orders', { ...store.get('service-orders', second.order.id), status: 'Em andamento' }, true, admin.id), { status: 409 })
  } finally { store.db.close() }
})

test('corretivas: falha reverte relatório, pendência, auditoria e recibo offline', async () => {
  const store = openDatabase(':memory:')
  try {
    seedRecords(store)
    const source = store.list('service-orders').find(item => item.status === 'Agendada')
    const tech = await account(store, 'Técnico', source.technicianId)
    const user = { ...tech, technician_id: source.technicianId }
    const inputReport = report(source.technicianId); delete inputReport.technicianId; delete inputReport.updatedAt
    const payload = { operationId: randomUUID(), base: { status: source.status, reportUpdatedAt: '' }, report: inputReport, photos: [] }
    store.db.exec("CREATE TRIGGER refuse_action BEFORE INSERT ON records WHEN NEW.resource='corrective-actions' BEGIN SELECT RAISE(ABORT, 'ensaio corretiva'); END")
    const audits = store.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n
    assert.throws(() => syncOfflineOrder(store, user, source.id, payload), /ensaio corretiva/)
    assert.deepEqual(store.get('service-orders', source.id), source)
    assert.equal(store.list('corrective-actions').length, 0)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, audits)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM offline_receipts').get().n, 0)
    store.db.exec('DROP TRIGGER refuse_action')
    syncOfflineOrder(store, user, source.id, payload); syncOfflineOrder(store, user, source.id, payload)
    assert.equal(store.list('corrective-actions').length, 1)
  } finally { store.db.close() }
})

test('corretivas API: atribuição, escopo por técnico, metadados protegidos e importação idempotente', async () => {
  const app = await createApp({ databasePath: ':memory:' })
  try {
    seedRecords(app.store)
    const source = app.store.list('service-orders')[0]
    const admin = await account(app.store, 'Administrador'), tech = await account(app.store, 'Técnico', source.technicianId)
    const otherTechnician = app.store.list('technicians').find(item => item.id !== source.technicianId)
    const other = await account(app.store, 'Técnico', otherTechnician.id), operator = await account(app.store, 'Operador')
    app.store.save('service-orders', { ...source, technicalReport: report(source.technicianId) }, true, tech.id)
    const action = app.store.list('corrective-actions')[0]
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
    let cookie = ''
    const call = (path, method = 'GET', body) => fetch(`http://127.0.0.1:${app.server.address().port}/api/${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-ACC-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const login = async user => { const response = await call('auth/login', 'POST', { email: user.email, password: 'Test-corrective-actions-123!' }); assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0] }
    assert.equal((await call('corrective-actions')).status, 401)
    await login(other)
    assert.equal((await (await call('corrective-actions')).json()).total, 0)
    assert.equal((await call(`corrective-actions/${action.id}`)).status, 404)
    await login(tech)
    const list = await (await call('corrective-actions')).json()
    assert.equal(list.total, 1); assert.equal(list.items[0].evidence.photos.length, 0); assert.equal(list.items[0].evidencePhotoCount, 1)
    assert.equal((await (await call(`corrective-actions/${action.id}`)).json()).evidence.photos.length, 1)
    assert.equal((await call(`corrective-actions/${action.id}`, 'PATCH', { dueDate: '2026-12-01' })).status, 403)
    assert.equal((await call(`corrective-actions/${action.id}/generate-order`, 'POST', {})).status, 403)
    assert.equal((await call('corrective-actions/import', 'POST', {})).status, 403)
    await login(operator)
    assert.equal((await call(`corrective-actions/${action.id}`, 'PATCH', { priority: 'Alta' })).status, 403)
    await login(admin)
    assert.equal((await call(`corrective-actions/${action.id}`, 'PATCH', { status: 'Resolvida' })).status, 400)
    assert.equal((await call(`corrective-actions/${action.id}`, 'DELETE')).status, 405)
    assert.equal((await call(`corrective-actions/${action.id}`, 'PATCH', { dueDate: '2026-02-30' })).status, 400)
    assert.equal((await call(`corrective-actions/${action.id}`, 'PATCH', { technicianId: {} })).status, 400)
    assert.equal((await call(`corrective-actions/${action.id}`, 'PATCH', { dueDate: '2026-12-01', technicianId: otherTechnician.id, priority: 'Alta' })).status, 200)
    await login(other)
    assert.equal((await call(`equipment/${source.equipmentId}`)).status, 200)
    assert.equal((await call(`service-orders/${source.id}`)).status, 404)
    await login(admin)
    assert.equal((await (await call('corrective-actions/import', 'POST', {})).json()).created, 0)
    assert.equal((await (await call('corrective-actions?summary=1')).json()).open, 1)
    // Simulate a report saved by an earlier app version, before automatic capture existed.
    const legacy = { ...source, id: randomUUID(), code: 'OS-LEGACY-NC', technicianId: otherTechnician.id, technicalReport: report(otherTechnician.id) }
    app.store.db.prepare('INSERT INTO records VALUES(?,?,?)').run('service-orders', legacy.id, JSON.stringify(legacy))
    assert.equal((await (await call('corrective-actions/import', 'POST', {})).json()).created, 1)
    assert.equal((await (await call('corrective-actions/import', 'POST', {})).json()).created, 0)
    const response = await call(`corrective-actions/${action.id}/generate-order`, 'POST', {}); assert.equal(response.status, 201)
    const { order } = await response.json()
    assert.equal(order.technicianId, otherTechnician.id)
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { correctiveActionId: 'forged' })).status, 400)
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { status: 'Concluída' })).status, 409)
    assert.equal((await call(`service-orders/${order.id}`, 'DELETE')).status, 409)
    await login(tech)
    assert.equal((await (await call('corrective-actions')).json()).total, 0)
    await login(other)
    assert.equal((await (await call('corrective-actions')).json()).total, 2)
    assert.equal((await call(`corrective-actions/${action.id}`)).status, 200)
  } finally { if (app.server.listening) await new Promise(resolve => app.server.close(resolve)); app.store.db.close() }
})
