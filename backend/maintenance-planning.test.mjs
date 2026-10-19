import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openDatabase } from './database.mjs'
import { seedRecords } from './seed.mjs'
import { createUser } from './auth.mjs'
import { createApp } from './server.mjs'
import { syncOfflineOrder } from './offline-sync.mjs'
import { validDay, validateSchedule, localDay, nextMaintenanceDue, maintenanceStatus, generatePreventiveOrder } from './maintenance-planning.mjs'
const schedule = { interval: 1, unit: 'months', nextDue: '2026-01-31', anchorDay: 31, checklistModelId: 'fancoil' }
function plan(store) {
  const equipment = store.list('equipment')[0], technician = store.list('technicians').find(item => item.status === 'Ativo')
  return store.save('maintenance', { id: randomUUID(), equipmentId: equipment.id, technicianId: technician.id, title: 'Preventiva programada', dueDate: schedule.nextDue, frequency: 'Mensal', status: 'Em dia', schedule: { ...schedule } })
}
test('preventivas: datas estritas, fuso de São Paulo, meses curtos e ciclos atrasados', () => {
  assert.equal(validDay('2026-02-29'), false); assert.equal(validDay('2028-02-29'), true)
  assert.equal(validDay('31/01/2026'), false)
  assert.equal(localDay(new Date('2026-10-19T01:00:00Z')), '2026-10-18')
  validateSchedule(schedule)
  for (const bad of [{ ...schedule, interval: 0 }, { ...schedule, interval: 1.5 }, { ...schedule, unit: 'hours' }, { ...schedule, nextDue: '2026-02-30' }, { ...schedule, anchorDay: 0 }, { ...schedule, checklistModelId: 'unknown' }]) assert.throws(() => validateSchedule(bad), { status: 400 })
  assert.equal(nextMaintenanceDue('2026-01-31', schedule, '2026-01-15'), '2026-02-28')
  assert.equal(nextMaintenanceDue('2026-02-28', schedule, '2026-02-28'), '2026-03-31')
  assert.equal(nextMaintenanceDue('2028-01-31', schedule, '2028-01-31'), '2028-02-29')
  assert.equal(nextMaintenanceDue('2026-01-31', schedule, '2026-10-19'), '2026-10-31')
  assert.equal(nextMaintenanceDue('2026-01-31', { ...schedule, interval: 3 }, '2026-11-01'), '2027-01-31')
  assert.equal(nextMaintenanceDue('2026-01-01', { ...schedule, unit: 'days', interval: 10 }, '2026-01-21'), '2026-01-31')
  assert.equal(nextMaintenanceDue('2026-01-01', { ...schedule, unit: 'days', interval: 10 }, '2025-12-31'), '2026-01-11')
  assert.equal(maintenanceStatus({ schedule }, '2026-01-31'), 'Crítica')
  assert.equal(maintenanceStatus({ schedule }, '2026-02-01'), 'Atrasada')
  assert.equal(maintenanceStatus({ schedule }, '2026-01-30'), 'Em dia')
  assert.equal(maintenanceStatus({ status: 'Crítica' }), 'Crítica')
})

test('preventivas: geração idempotente, histórico protegido, conclusão atômica e recibo offline', async () => {
  const store = openDatabase(':memory:')
  try {
    seedRecords(store)
    const item = plan(store)
    const admin = await createUser(store.db, { name: 'Admin', email: 'planner@example.test', password: 'Test-planner-123!', role: 'Administrador' })
    const tech = await createUser(store.db, { name: 'Técnico', email: 'planner-tech@example.test', password: 'Test-planner-123!', role: 'Técnico', technicianId: item.technicianId })
    const user = { ...tech, technician_id: item.technicianId }
    assert.throws(() => generatePreventiveOrder(store, user, item.id), { status: 403 })
    const first = generatePreventiveOrder(store, admin, item.id)
    assert.equal(first.created, true); assert.equal(first.order.checklistModelId, 'fancoil')
    assert.equal(first.order.equipmentId, item.equipmentId)
    assert.equal(generatePreventiveOrder(store, admin, item.id).order.id, first.order.id)
    assert.equal(generatePreventiveOrder(store, admin, item.id).created, false)
    assert.throws(() => store.save('maintenance', { ...item, title: 'Mudou' }, true, admin.id), { status: 409 })
    assert.throws(() => store.remove('maintenance', item.id, admin.id), { status: 409 })
    assert.throws(() => store.remove('service-orders', first.order.id, admin.id), { status: 409 })
    const oldEquipment = store.get('equipment', item.equipmentId)
    const input = { operationId: randomUUID(), base: { status: 'Agendada', reportUpdatedAt: '' }, status: 'Concluída', report: { diagnosis: 'Inspeção', workPerformed: 'Manutenção', materialsUsed: '', recommendations: '' }, photos: [] }
    // Simulate a failure after writing the OS but before advancing the plan.
    store.db.exec(`CREATE TRIGGER refuse_schedule BEFORE UPDATE ON records WHEN NEW.resource='maintenance' BEGIN SELECT RAISE(ABORT, 'ensaiar rollback'); END`)
    const audits = store.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n
    assert.throws(() => syncOfflineOrder(store, user, first.order.id, input), /ensaiar rollback/)
    assert.equal(store.get('service-orders', first.order.id).status, 'Agendada')
    assert.equal(store.get('maintenance', item.id).schedule.nextDue, schedule.nextDue)
    assert.deepEqual(store.get('equipment', item.equipmentId), oldEquipment)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, audits)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM offline_receipts').get().n, 0)
    store.db.exec('DROP TRIGGER refuse_schedule')
    const saved = syncOfflineOrder(store, user, first.order.id, input)
    assert.ok(saved.completedAt)
    const due = store.get('maintenance', item.id).schedule.nextDue
    assert.equal(due, nextMaintenanceDue(schedule.nextDue, schedule, localDay(new Date(saved.completedAt))))
    assert.equal(store.get('equipment', item.equipmentId).lastMaintenance, localDay(new Date(saved.completedAt)))
    assert.deepEqual(syncOfflineOrder(store, user, first.order.id, input), saved)
    assert.equal(store.get('maintenance', item.id).schedule.nextDue, due)
    store.save('service-orders', { ...saved, description: 'Relatório revisado' }, true, admin.id)
    assert.equal(store.get('maintenance', item.id).schedule.nextDue, due)
    assert.throws(() => store.save('service-orders', { ...saved, status: 'Em andamento' }, true, admin.id), { status: 409 })
    const currentPlan = store.get('maintenance', item.id)
    store.save('maintenance', { ...currentPlan, dueDate: schedule.nextDue, schedule: { ...currentPlan.schedule, nextDue: schedule.nextDue } }, true, admin.id)
    assert.throws(() => generatePreventiveOrder(store, admin, item.id), { status: 409 })
    store.save('maintenance', currentPlan, true, admin.id)
    const second = generatePreventiveOrder(store, admin, item.id)
    assert.equal(second.created, true); assert.notEqual(second.order.id, first.order.id)
    assert.equal(second.order.maintenanceDue, due)
    assert.equal(store.list('service-orders').filter(order => order.maintenanceId === item.id).length, 2)
  } finally { store.db.close() }
})

test('preventivas API: perfis, histórico paginado e conclusão online sem duplicar ciclos', async () => {
  const app = await createApp({ databasePath: ':memory:' })
  try {
    seedRecords(app.store)
    const item = plan(app.store)
    const password = 'Test-planner-api-123!'
    for (const [role, email] of [['Administrador', 'admin'], ['Gestor', 'manager'], ['Técnico', 'tech'], ['Operador', 'operator']]) await createUser(app.store.db, { name: role, role, email: `${email}@example.test`, password, ...(role === 'Técnico' ? { technicianId: item.technicianId } : {}) })
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
    let cookie = ''
    const call = (path, method = 'GET', data) => fetch(`http://127.0.0.1:${app.server.address().port}/api/${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-ACC-Request': '1' }, body: data === undefined ? undefined : JSON.stringify(data) })
    const login = async email => { const response = await call('auth/login', 'POST', { email: `${email}@example.test`, password }); assert.equal(response.status, 200); cookie = response.headers.get('set-cookie').split(';')[0] }
    assert.equal((await call(`maintenance/${item.id}/generate-order`, 'POST', {})).status, 401)
    await login('operator'); assert.equal((await call(`maintenance/${item.id}/generate-order`, 'POST', {})).status, 403)
    await login('tech'); assert.equal((await call(`maintenance/${item.id}/generate-order`, 'POST', {})).status, 403)
    await login('manager')
    const generated = await call(`maintenance/${item.id}/generate-order`, 'POST', {}); assert.equal(generated.status, 201)
    const { order } = await generated.json()
    assert.equal((await call(`maintenance/${item.id}/generate-order`, 'POST', {})).status, 200)
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { maintenanceDue: '2027-01-01' })).status, 400)
    await login('tech')
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { status: 'Em andamento' })).status, 200)
    const closed = await call(`service-orders/${order.id}`, 'PATCH', { status: 'Concluída' }); assert.equal(closed.status, 200)
    const completion = (await closed.json()).completedAt
    const next = app.store.get('maintenance', item.id).schedule.nextDue
    assert.equal(next, nextMaintenanceDue(schedule.nextDue, schedule, localDay(new Date(completion))))
    const history = await call(`equipment/${item.equipmentId}/history`); assert.equal(history.status, 200)
    const data = await history.json(); assert.ok(data.orders.some(row => row.id === order.id)); assert.ok(data.orders.every(row => row.technicianId === item.technicianId)); assert.ok(data.orders.every(row => !Object.hasOwn(row, 'technicalReport')))
    assert.equal((await call('equipment/missing/history')).status, 404)
    assert.equal((await call(`equipment/${item.equipmentId}/history?page=0`)).status, 400)
    const otherTech = app.store.list('technicians').find(row => row.id !== item.technicianId)
    const otherOrder = app.store.save('service-orders', { ...order, id: randomUUID(), maintenanceId: undefined, maintenanceDue: undefined, checklistModelId: undefined, code: 'OS-PRIVATE', technicianId: otherTech.id })
    const scoped = await (await call(`equipment/${item.equipmentId}/history`)).json()
    assert.ok(!scoped.orders.some(row => row.id === otherOrder.id))
    await login('admin')
    const adminHistory = await (await call(`equipment/${item.equipmentId}/history`)).json(); assert.ok(adminHistory.orders.some(row => row.id === otherOrder.id))
    for (let index = 0; index < 22; index++) app.store.save('service-orders', { ...otherOrder, id: randomUUID(), code: `OS-HISTORY-${index}` })
    const firstPage = await (await call(`equipment/${item.equipmentId}/history`)).json()
    const secondPage = await (await call(`equipment/${item.equipmentId}/history?page=2`)).json()
    assert.equal(firstPage.orders.length, 20)
    assert.equal(firstPage.orders.length + secondPage.orders.length, firstPage.total)
    assert.ok(firstPage.orders.every(a => secondPage.orders.every(b => a.id !== b.id)))
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { status: 'Em andamento' })).status, 409)
    assert.equal((await call(`maintenance/${item.id}`, 'DELETE')).status, 409)
    assert.equal((await call(`service-orders/${order.id}`, 'DELETE')).status, 409)
  } finally { if (app.server.listening) await new Promise(resolve => app.server.close(resolve)); app.store.db.close() }
})
