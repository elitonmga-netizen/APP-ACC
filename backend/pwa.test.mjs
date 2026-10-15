import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { resolve } from 'node:path'
import { createApp } from './server.mjs'

function worker(network = async request => new Response(request.url?.endsWith('/index.html') ? '<script src="/assets/index-test.js"></script><link href="/assets/index-test.css">' : 'online', { headers: { 'Content-Type': 'text/html' } })) {
  const handlers = {}, writes = [], removed = []
  const offline = new Response('offline'), shell = new Response('shell')
  const cache = { add: async request => writes.push(request), put: async (path, response) => writes.push({ url: 'https://acc.test' + path, credentials: 'omit', response }), match: async path => path === '/index.html' ? shell : path === '/offline.html' ? offline : undefined }
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://acc.test' }, clients: { claim: async () => {} }, addEventListener: (name, handler) => { handlers[name] = handler } },
    caches: { open: async () => cache, keys: async () => ['acc-public-offline-v1', 'acc-public-shell-v1', 'acc-public-shell-v2', 'other-app'], delete: async name => removed.push(name) },
    Request: class extends Request { constructor(url, options) { super(new URL(url, 'https://acc.test'), options) } }, Response, URL, fetch: network,
  })
  return { handlers, writes, removed, offline, shell }
}

test('PWA offline: cache somente do shell público e assets sem credenciais; preserva caches alheios', async () => {
  const { handlers, writes, removed } = worker()
  await new Promise((resolve, reject) => handlers.install({ waitUntil: promise => promise.then(resolve, reject) }))
  assert.deepEqual(writes.map(request => [request.url, request.credentials]), [['https://acc.test/index.html', 'omit'], ['https://acc.test/offline.html', 'omit'], ['https://acc.test/assets/index-test.js', 'omit'], ['https://acc.test/assets/index-test.css', 'omit']])
  await new Promise((resolve, reject) => handlers.activate({ waitUntil: promise => promise.then(resolve, reject) }))
  assert.deepEqual(removed, ['acc-public-offline-v1', 'acc-public-shell-v1'])
})

test('PWA offline: API, mutações e outras origens nunca entram no cache', () => {
  const { handlers, writes } = worker()
  for (const [url, method, mode] of [
    ['https://acc.test/api/service-orders', 'GET', 'navigate'], ['https://acc.test/api/auth/me', 'GET', 'cors'],
    ['https://acc.test/api/service-orders/1', 'PATCH', 'cors'], ['https://external.test/', 'GET', 'navigate'],
  ]) handlers.fetch({ request: { url, method, mode }, respondWith: () => assert.fail('Requisição sensível interceptada') })
  assert.equal(writes.length, 0)
})

test('PWA offline: raiz sem parâmetros abre shell; recuperação e URLs parametrizadas abrem página genérica', async () => {
  const onlineWorker = worker()
  let onlineResponse
  onlineWorker.handlers.fetch({ request: { url: 'https://acc.test/', method: 'GET', mode: 'navigate' }, respondWith: promise => { onlineResponse = promise } })
  assert.equal(await (await onlineResponse).text(), 'online')
  for (const url of ['https://acc.test/', 'https://acc.test/?token=secret', 'https://acc.test/reset-password?token=secret']) {
    const { handlers, offline, shell, writes } = worker(async () => { throw new Error('offline') })
    let response
    handlers.fetch({ request: { url, method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise } })
    assert.equal(await response, url === 'https://acc.test/' ? shell : offline)
    assert.equal(writes.length, 0)
  }
})

test('PWA: manifesto aponta para ícones PNG Android válidos', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url)))
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.ok(manifest.name && manifest.short_name)
  assert.equal(manifest.prefer_related_applications, false)
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'))
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose.includes('maskable')))
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /rel="manifest" href="\/manifest.webmanifest"/)
  for (const icon of manifest.icons) {
    const bytes = readFileSync(new URL(`../public${icon.src}`, import.meta.url))
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes)
  }
})

test('PWA: arquivos reais são servidos com MIME correto e revalidação; API não é cacheável', async () => {
  const app = await createApp({ databasePath: ':memory:', staticDirectory: resolve('public') })
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${app.server.address().port}`
  try {
    for (const [path, mime] of [
      ['/manifest.webmanifest', 'application/manifest+json'], ['/sw.js', 'text/javascript'],
      ['/offline.html', 'text/html'], ['/icons/acc-192.png', 'image/png'], ['/icons/acc-512.png', 'image/png'],
    ]) {
      const response = await fetch(base + path)
      assert.equal(response.status, 200, path)
      assert.ok(response.headers.get('content-type').startsWith(mime), path)
      assert.equal(response.headers.get('cache-control'), 'no-cache', path)
    }
    assert.equal((await fetch(base + '/api/service-orders')).headers.get('cache-control'), 'no-store')
  } finally { await new Promise(resolve => app.server.close(resolve)); app.store.db.close() }
})

test('PWA: registro funciona antes e depois do evento load, sem registro em desenvolvimento', async () => {
  const source = readFileSync(new URL('../src/services/pwa.ts', import.meta.url), 'utf8').replace('export function', 'function')
  for (const readyState of ['loading', 'complete']) {
    const registrations = [], listeners = []
    runInNewContext(source.replace('import.meta.env.PROD', 'true') + '; registerPwa()', {
      document: { readyState }, navigator: { serviceWorker: { register: (...args) => { registrations.push(args); return Promise.resolve() } } },
      window: { addEventListener: (...args) => listeners.push(args) },
    })
    if (readyState === 'loading') {
      assert.equal(registrations.length, 0)
      assert.equal(listeners[0][0], 'load')
      assert.equal(listeners[0][2].once, true)
      listeners[0][1]()
    }
    assert.equal(registrations[0][0], '/sw.js')
    assert.equal(registrations[0][1].updateViaCache, 'none')
  }
  runInNewContext(source.replace('import.meta.env.PROD', 'false') + '; registerPwa()', {
    navigator: {}, window: { addEventListener: () => assert.fail('Registro em desenvolvimento') },
  })
})
