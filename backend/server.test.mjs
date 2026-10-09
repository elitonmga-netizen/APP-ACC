import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './server.mjs'
import { createUser } from './auth.mjs'
import { openDatabase } from './database.mjs'
test('API: autenticação, CRUD, relações, perfis, sessão e persistência', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-test-'))
  const path = join(dir, 'test.sqlite')
  const app = await createApp({ databasePath: path })
  const password = 'Temporary-test-password-123!'
  await createUser(app.store.db, { email: 'admin@example.test', name: 'Admin', password, role: 'Administrador' })
  await createUser(app.store.db, { email: 'tech@example.test', name: 'Tech', password, role: 'Técnico' })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${app.server.address().port}/api/`
  let cookie = ''
  const call = (route, method = 'GET', data, headers = {}) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-ACC-Request': '1', Cookie: cookie, ...headers }, body: data === undefined ? undefined : JSON.stringify(data) })
  const post = async (resource, data) => { const response = await call(resource, 'POST', data); assert.equal(response.status, 201, await response.clone().text()); return response.json() }
  try {
    assert.equal((await call('clients')).status, 401)
    assert.equal((await call('auth/login', 'POST', { email: 'admin@example.test', password: 'wrong' })).status, 401)
    const login = await call('auth/login', 'POST', { email: 'admin@example.test', password }); assert.equal(login.status, 200)
    cookie = login.headers.get('set-cookie').split(';')[0]
    assert.match(login.headers.get('set-cookie'), /HttpOnly/)
    assert.equal((await call('clients', 'POST', {}, { Origin: 'https://evil.example' })).status, 403)
    assert.equal((await call('clients', 'POST', {}, { 'X-ACC-Request': '' })).status, 403)
    assert.equal((await call('clients', 'POST', {})).status, 400)
    const client = await post('clients', { name: 'Fictício', document: 'Pendente', contact: 'Teste', phone: '000', status: 'Ativo', units: 0 })
    const location = await post('locations', { name: 'Teste', clientId: client.id, city: 'Teste', address: 'Teste', manager: 'Teste', status: 'Ativo' })
    const system = await post('climate-systems', { name: 'Split teste', type: 'Split', capacity: '12000 BTU', refrigerant: 'R-32' })
    const technician = await post('technicians', { name: 'Teste', initials: 'TT', specialty: 'Split', status: 'Ativo' })
    const equipment = await post('equipment', { name: 'Teste', tag: 'T-01', clientId: client.id, locationId: location.id, systemId: system.id, lastMaintenance: '01/01/2026', status: 'Em dia' })
    const order = await post('service-orders', { code: 'OS-T', clientId: client.id, locationId: location.id, equipmentId: equipment.id, technicianId: technician.id, scheduledFor: '01/01/2026', priority: 'Baixa', status: 'Agendada', description: 'Teste' })
    const maintenance = await post('maintenance', { title: 'Teste', equipmentId: equipment.id, technicianId: technician.id, dueDate: '01/01/2026', frequency: 'Mensal', status: 'Em dia' })
    assert.equal((await call(`clients/${client.id}`, 'DELETE')).status, 409)
    assert.equal((await call(`locations/${location.id}`, 'PATCH', { clientId: 'missing' })).status, 400)
    const otherClient = await post('clients', { name: 'Outro', document: 'Pendente', contact: 'Teste', phone: '000', status: 'Ativo', units: 0 })
    assert.equal((await call(`locations/${location.id}`, 'PATCH', { clientId: otherClient.id })).status, 400)
    for (const [resource, record] of Object.entries({ clients: client, locations: location, equipment, 'service-orders': order, maintenance, technicians: technician })) {
      assert.equal((await call(resource)).status, 200)
      assert.equal((await call(`${resource}/${record.id}`)).status, 200)
      const response = await call(`${resource}/${record.id}`, 'PUT', Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'id')))
      assert.equal(response.status, 200)
    }
    assert.equal((await call(`clients/${client.id}`, 'PATCH', { name: 'Atualizado' })).status, 200)
    assert.equal((await call(`clients/${client.id}`, 'PATCH', { id: 'overwrite' })).status, 400)
    assert.equal((await call(`clients/${client.id}`, 'PATCH', { role: 'Administrador' })).status, 400)
    assert.equal((await call('clients/missing')).status, 404)
    const techLogin = await call('auth/login', 'POST', { email: 'tech@example.test', password })
    const adminCookie = cookie; cookie = techLogin.headers.get('set-cookie').split(';')[0]
    assert.equal((await call('clients')).status, 200)
    assert.equal((await call(`clients/${client.id}`, 'PATCH', { name: 'Denied' })).status, 403)
    assert.equal((await call('users', 'POST', {})).status, 403)
    await call('auth/logout', 'POST'); assert.equal((await call('auth/me')).status, 401)
    cookie = adminCookie
    assert.equal((await call(`maintenance/${maintenance.id}`, 'DELETE')).status, 204)
    app.store.db.prepare('UPDATE sessions SET expires_at=0').run()
    assert.equal((await call('auth/me')).status, 401)
    assert.ok(!JSON.stringify(await (await call('auth/login', 'POST', { email: 'admin@example.test', password })).json()).includes('password_hash'))
  } finally {
    await new Promise(resolve => app.server.close(resolve)); app.store.db.close()
  }
  const reopened = openDatabase(path)
  assert.ok(reopened.list('clients').some(client => client.name === 'Atualizado'))
  reopened.db.close(); rmSync(dir, { recursive: true })
})
