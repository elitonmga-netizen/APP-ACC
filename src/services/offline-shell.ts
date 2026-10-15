export async function prepareOfflineShell() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('Instale ou abra o aplicativo pelo Chrome com HTTPS para preparar o modo offline.')
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) throw new Error('A instalação está sendo preparada. Aguarde alguns segundos e tente novamente.')
  await registration.update()
  if (registration.waiting) {
    await new Promise<void>((resolve, reject) => {
      const changed = () => { window.clearTimeout(timer); resolve() }
      const timer = window.setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', changed); reject(new Error('Feche e reabra o aplicativo para concluir a atualização offline.')) }, 10000)
      navigator.serviceWorker.addEventListener('controllerchange', changed, { once: true })
      registration.waiting?.postMessage({ type: 'ACTIVATE_OFFLINE' })
    })
  }
  if (!await caches.has('acc-public-shell-v2')) throw new Error('A atualização offline ainda está instalando. Feche e reabra o aplicativo conectado e tente novamente.')
}
