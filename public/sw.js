/* Cache somente do shell público e dos assets gerados. Dados da equipe ficam
   exclusivamente no IndexedDB do modo offline, mediante preparação explícita. */
const CACHE_NAME = 'acc-public-shell-v2'
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const request = new Request('/index.html', { credentials: 'omit', cache: 'reload' })
    const response = await fetch(request)
    if (!response.ok || !(response.headers.get('content-type') || '').startsWith('text/html')) throw new Error('Shell indisponível')
    const html = await response.clone().text()
    const assets = [...new Set(html.match(/\/assets\/[A-Za-z0-9_-]+\.(?:js|css)/g) || [])]
    if (!assets.some(path => path.endsWith('.js'))) throw new Error('Shell sem aplicação')
    await cache.put('/index.html', response)
    await cache.add(new Request('/offline.html', { credentials: 'omit', cache: 'reload' }))
    for (const path of assets) await cache.add(new Request(path, { credentials: 'omit', cache: 'reload' }))
  })())
})
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_OFFLINE') void self.skipWaiting() })
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('acc-public-shell-') || key.startsWith('acc-public-offline-')) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/assets/') && !url.search) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => await cache.match(url.pathname) || fetch(event.request)))
    return
  }
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(CACHE_NAME)
    return await cache.match(url.pathname === '/' && !url.search ? '/index.html' : '/offline.html') || Response.error()
  }))
})
