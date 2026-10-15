/* Somente a página pública de indisponibilidade é persistida. Nenhuma API,
   página autenticada, token, URL com parâmetros ou resposta operacional entra no cache. */
const CACHE_NAME = 'acc-public-offline-v1'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(new Request('/offline.html', { credentials: 'omit', cache: 'reload' }))))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('acc-public-offline-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(async () => {
    // Não substitui links de redefinição por uma página persistida com parâmetros.
    return await caches.match('/offline.html') || Response.error()
  }))
})
