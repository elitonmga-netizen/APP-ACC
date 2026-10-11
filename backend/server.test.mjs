import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  const technician = { id: 'technician-profile', name: 'Teste', initials: 'TT', specialty: 'Split', status: 'Ativo' }
  app.store.save('technicians', technician)
  const otherTechnician = { id: 'other-technician-profile', name: 'Outro', initials: 'OT', specialty: 'VRF', status: 'Ativo' }
  app.store.save('technicians', otherTechnician)
  await createUser(app.store.db, { email: 'admin@example.test', name: 'Admin', password, role: 'Administrador' })
  await assert.rejects(createUser(app.store.db, { email: 'unlinked@example.test', name: 'Unlinked', password, role: 'Técnico', technicianId: '' }), { status: 400 })
  await createUser(app.store.db, { email: 'tech@example.test', name: 'Tech', password, role: 'Técnico', technicianId: technician.id })
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
    const equipment = await post('equipment', { name: 'Teste', tag: 'T-01', clientId: client.id, locationId: location.id, systemId: system.id, lastMaintenance: '01/01/2026', status: 'Em dia' })
    const order = await post('service-orders', { code: 'OS-T', clientId: client.id, locationId: location.id, equipmentId: equipment.id, technicianId: technician.id, scheduledFor: '01/01/2026', priority: 'Baixa', status: 'Agendada', description: 'Teste' })
    const otherOrder = app.store.save('service-orders', { ...order, id: 'other-order', code: 'OS-OUTRA', technicianId: otherTechnician.id })
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
    const search = await call('clients?page=1&limit=1&q=Atualizado&status=Ativo')
    assert.deepEqual(await search.json().then(result => [result.total, result.items.length, result.page, result.limit]), [1, 1, 1, 1])
    const users = await call('users'); assert.equal(users.status, 200); const listedUsers = await users.json(); assert.ok(!JSON.stringify(listedUsers).includes('password_hash'))
    assert.equal((await call('users', 'POST', { email: 'new-tech@example.test', name: 'Novo Técnico', role: 'Técnico', password, technicianId: '' })).status, 400)
    const createdUserResponse = await call('users', 'POST', { email: 'operator@example.test', name: 'Operador', role: 'Operador', password })
    assert.equal(createdUserResponse.status, 201)
    const createdUser = await createdUserResponse.json()
    assert.equal((await call(`users/${createdUser.id}`, 'PATCH', { active: false })).status, 200)
    assert.equal((await call('auth/login', 'POST', { email: createdUser.email, password })).status, 401)
    assert.equal((await call(`users/${createdUser.id}`, 'PATCH', { active: true })).status, 200)
    assert.equal((await call(`users/${createdUser.id}/password`, 'POST', { password: 'Another-temporary-password-456!' })).status, 204)
    assert.equal((await call('auth/login', 'POST', { email: createdUser.email, password })).status, 401)
    assert.equal((await call('auth/login', 'POST', { email: createdUser.email, password: 'Another-temporary-password-456!' })).status, 200)
    const adminUser = listedUsers.find(item => item.email === 'admin@example.test')
    assert.equal((await call(`users/${adminUser.id}`, 'PATCH', { active: false })).status, 400)
    assert.equal((await call('users', 'POST', { email: 'last-admin@example.test', name: 'Admin 2', role: 'Administrador', password })).status, 201)
    assert.equal((await call('audit?page=1&limit=100')).status, 200)
    assert.equal((await call('clients/missing')).status, 404)
    const techLogin = await call('auth/login', 'POST', { email: 'tech@example.test', password })
    const adminCookie = cookie; cookie = techLogin.headers.get('set-cookie').split(';')[0]
    assert.equal((await call('clients')).status, 200)
    assert.equal((await (await call('service-orders')).json()).some(item => item.id === order.id), true)
    assert.equal((await call(`service-orders/${otherOrder.id}`)).status, 404)
    const technicalReport = { diagnosis: 'Filtro obstruído', workPerformed: 'Limpeza e teste do equipamento', materialsUsed: 'Produto de limpeza', recommendations: 'Revisar em 30 dias' }
    const savedReport = await call(`service-orders/${order.id}/technical-report`, 'PATCH', technicalReport)
    assert.equal(savedReport.status, 200, await savedReport.clone().text())
    const savedOrder = await savedReport.json()
    assert.deepEqual(Object.fromEntries(Object.entries(savedOrder.technicalReport).filter(([key]) => key !== 'updatedAt')), { ...technicalReport, technicianId: technician.id })
    assert.ok(Number.isFinite(Date.parse(savedOrder.technicalReport.updatedAt)))
    assert.equal((await call(`service-orders/${otherOrder.id}/technical-report`, 'PATCH', technicalReport)).status, 404)
    assert.equal((await call(`service-orders/${order.id}/technical-report`, 'PATCH', { ...technicalReport, clientId: client.id })).status, 400)
    assert.equal((await call(`service-orders/${order.id}/technical-report`, 'PATCH', { ...technicalReport, diagnosis: '' })).status, 400)
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { status: 'Em andamento' })).status, 200)
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { status: 'Concluída' })).status, 200)
    assert.equal((await call(`service-orders/${order.id}`, 'PATCH', { status: 'Em andamento' })).status, 400)
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
  assert.equal(reopened.list('service-orders').find(item => item.code === 'OS-T').technicalReport.diagnosis, 'Filtro obstruído')
  reopened.db.close(); rmSync(dir, { recursive: true })
})

test('API: recuperação por email usa token de uso único e troca a senha', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-reset-test-'))
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, url: process.env.APP_PUBLIC_URL, fetch: globalThis.fetch }
  const requestFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_FROM = 'APP-ACC <no-reply@example.test>'
  process.env.APP_PUBLIC_URL = 'https://app.example.test'
  let emailPayload
  globalThis.fetch = async (_url, options) => { emailPayload = JSON.parse(options.body); return new Response('{}', { status: 200 }) }
  const app = await createApp({ databasePath: join(dir, 'test.sqlite') })
  const password = 'Temporary-test-password-123!'
  await createUser(app.store.db, { email: 'reset@example.test', name: '<Conta>', password, role: 'Operador' })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${app.server.address().port}/api/`
  const call = (route, method = 'GET', data) => requestFetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-ACC-Request': '1' }, body: data === undefined ? undefined : JSON.stringify(data) })
  try {
    const recovery = await call('auth/forgot-password', 'POST', { email: 'reset@example.test' })
    assert.equal(recovery.status, 200)
    assert.deepEqual(await recovery.json(), { message: 'Se o email estiver cadastrado, enviaremos um link para redefinir a senha.' })
    assert.match(emailPayload.html, /&lt;Conta&gt;/)
    const token = emailPayload.text.match(/token=([a-f0-9]{64})/)?.[1]
    assert.ok(token)
    assert.equal(app.store.db.prepare('SELECT token_hash FROM password_reset_tokens').get().token_hash.length, 64)
    const newPassword = 'New-account-password-789!'
    assert.equal((await call('auth/reset-password', 'POST', { token, password: newPassword })).status, 200)
    assert.equal((await call('auth/reset-password', 'POST', { token, password: newPassword })).status, 400)
    assert.equal((await call('auth/login', 'POST', { email: 'reset@example.test', password })).status, 401)
    assert.equal((await call('auth/login', 'POST', { email: 'reset@example.test', password: newPassword })).status, 200)
  } finally {
    await new Promise(resolve => app.server.close(resolve)); app.store.db.close(); rmSync(dir, { recursive: true })
    globalThis.fetch = previous.fetch
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_PUBLIC_URL']) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
  }
})

test('servidor entrega o frontend e resolve rotas da aplicação', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-web-test-'))
  const staticDirectory = join(dir, 'dist')
  mkdirSync(staticDirectory)
  writeFileSync(join(staticDirectory, 'index.html'), '<!doctype html><title>APP-ACC test</title>')
  writeFileSync(join(staticDirectory, 'asset.js'), 'window.appReady=true')
  const app = await createApp({ databasePath: join(dir, 'test.sqlite'), staticDirectory })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${app.server.address().port}`
  try {
    const page = await fetch(base)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /APP-ACC test/)
    const route = await fetch(`${base}/reset-password`)
    assert.equal(route.status, 200)
    const asset = await fetch(`${base}/asset.js`)
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal(await asset.text(), 'window.appReady=true')
    assert.equal((await fetch(`${base}/missing.js`)).status, 404)
  } finally { await new Promise(resolve => app.server.close(resolve)); app.store.db.close(); rmSync(dir, { recursive: true }) }
})

test('bootstrap cria o administrador inicial uma vez e preserva contas existentes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-bootstrap-test-'))
  const databasePath = join(dir, 'test.sqlite')
  const script = fileURLToPath(new URL('./bootstrap-admin.mjs', import.meta.url))
  const env = { ...process.env, DATABASE_PATH: databasePath, ADMIN_EMAIL: 'first-admin@example.test', ADMIN_NAME: 'Admin Inicial', ADMIN_PASSWORD: 'Temporary-bootstrap-password-567!' }
  try {
    const firstRun = spawnSync(process.execPath, [script], { env, encoding: 'utf8' })
    assert.equal(firstRun.status, 0, firstRun.stderr)
    const secondRun = spawnSync(process.execPath, [script], { env: { ...env, ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }, encoding: 'utf8' })
    assert.equal(secondRun.status, 0, secondRun.stderr)
    const store = openDatabase(databasePath)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1)
    store.db.close()
  } finally { rmSync(dir, { recursive: true }) }
})
