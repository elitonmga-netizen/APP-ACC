import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'

class ApiError extends Error { constructor(message, status) { super(message); this.status = status } }
function fixture() {
  const memory = new Map()
  let quota = false, time = Date.now()
  const user = { id: 'tech-user', name: 'Técnico', email: 'test@example.test', role: 'Técnico', technicianId: 'tech-1' }
  const order = { id: 'order-1', code: 'OS-1', technicianId: 'tech-1', status: 'Agendada' }
  const sent = []
  let network = async (path, method, body) => {
    if (path === 'auth/me') return user
    if (path.endsWith('/offline-sync')) { sent.push(structuredClone(body)); return { ...order, status: body.status || order.status } }
    if (path.endsWith('/photos')) return []
    return path === 'service-orders' ? [order] : []
  }
  const indexedDB = { open() {
    const opening = {}
    queueMicrotask(() => {
      opening.result = { close() {}, transaction() {
        const tx = { objectStore() {
          const operation = (type, key, value) => {
            const request = {}
            queueMicrotask(() => {
              if (quota && type !== 'get') { tx.onabort?.(); return }
              if (type === 'put') memory.set(key, structuredClone(value))
              if (type === 'delete') memory.delete(key)
              request.result = type === 'get' ? structuredClone(memory.get(key)) : key
              request.onsuccess?.(); tx.oncomplete?.()
            })
            return request
          }
          return { get: key => operation('get', key), put: (value, key) => operation('put', key, value), delete: key => operation('delete', key) }
        } }
        return tx
      } }
      opening.onsuccess?.()
    })
    return opening
  } }
  const load = () => {
    const output = ts.transpileModule(readFileSync(new URL('../src/services/offline.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const exports = {}
    runInNewContext(output, { exports, require: () => ({ ApiError, requestOnline: (...args) => network(...args) }), indexedDB, window: new EventTarget(), Event, crypto: { randomUUID }, Date: class extends Date { static now() { return time } }, console })
    return exports
  }
  return { load, user, order, sent, memory, setQuota: value => { quota = value }, advance: ms => { time += ms }, setNetwork: value => { network = value } }
}
const report = { diagnosis: 'Filtro sujo', workPerformed: 'Limpeza', materialsUsed: '', recommendations: '' }
test('offline cliente: reabertura, escopo por usuário, expiração e falha de espaço sem falso sucesso', async () => {
  const f = fixture(), client = f.load()
  await client.prepareOffline(f.user)
  await client.queueOffline('service-orders/order-1/technical-report', 'PATCH', report)
  await client.queueOffline('service-orders/order-1', 'PATCH', { status: 'Em andamento' })
  await client.queueOffline('service-orders/order-1/photos', 'POST', { stage: 'Antes', caption: 'Teste', data: 'data:image/jpeg;base64,test' })
  const reopened = f.load()
  assert.equal((await reopened.resumeOfflineUser()).id, f.user.id)
  const cached = await reopened.cachedResource('service-orders')
  assert.equal(cached[0].status, 'Em andamento')
  assert.equal(cached[0].technicalReport.diagnosis, report.diagnosis)
  assert.equal((await reopened.cachedResource('service-orders/order-1/photos')).length, 1)
  await assert.rejects(reopened.releaseOffline(), /Sincronize/)
  await assert.rejects(reopened.checkOfflineIdentity({ ...f.user, id: 'other' }), /outra conta/)
  f.setQuota(true)
  await assert.rejects(reopened.queueOffline('service-orders/order-1/technical-report', 'PATCH', { ...report, diagnosis: 'Não gravado' }), /espaço/)
  assert.equal((await reopened.cachedResource('service-orders'))[0].technicalReport.diagnosis, report.diagnosis)
  f.setQuota(false); f.advance(9 * 60 * 60 * 1000)
  assert.equal(await f.load().resumeOfflineUser(), null)
  assert.equal(Object.keys(f.memory.get('snapshot').drafts).length, 1)
  await assert.rejects(reopened.cachedResource('service-orders'), /8 horas/)
  assert.equal(JSON.stringify(f.memory.get('snapshot')).includes('password'), false)
})
test('offline cliente: resposta perdida mantém ID e bloqueia edição até confirmação, sem perder o rascunho', async () => {
  const f = fixture(), client = f.load()
  await client.prepareOffline(f.user)
  await client.queueOffline('service-orders/order-1/technical-report', 'PATCH', report)
  let attempts = 0, firstId
  f.setNetwork(async (path, method, body) => {
    if (path === 'auth/me') return f.user
    if (path.endsWith('/photos')) return []
    if (path.endsWith('/offline-sync')) {
      attempts++
      if (attempts === 1) { firstId = body.operationId; throw new TypeError('Rede caiu depois do envio') }
      assert.equal(body.operationId, firstId)
      return f.order
    }
    throw new Error('unexpected')
  })
  await assert.rejects(client.syncOffline(), /Rede caiu/)
  assert.equal((await client.offlineInfo()).pending, 1)
  await assert.rejects(client.queueOffline('service-orders/order-1/technical-report', 'PATCH', report), /aguarda confirmação/)
  await client.syncOffline()
  assert.equal((await client.offlineInfo()).pending, 0)
  assert.equal(attempts, 2)
})
test('offline cliente: conflito e sessão expirada preservam as alterações no dispositivo', async () => {
  const f = fixture(), client = f.load()
  await client.prepareOffline(f.user)
  await client.queueOffline('service-orders/order-1/technical-report', 'PATCH', report)
  f.setNetwork(async path => { if (path === 'auth/me') return f.user; throw new ApiError('A OS mudou no servidor', 409) })
  await assert.rejects(client.syncOffline(), /mudou/)
  assert.equal((await client.offlineInfo()).pending, 1)
  f.setNetwork(async () => { throw new ApiError('Faça login', 401) })
  await assert.rejects(client.syncOffline(), /sessão expirou/)
  assert.equal((await client.offlineInfo()).pending, 1)
})
