export function registerPwa() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
        // A aplicação online continua disponível quando a instalação não é suportada.
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }
}
