import { ApiError, requestOnline } from './http'
import { cachedResource, hasPendingOrder, isOfflinePrepared, overlayOrders, queueOffline } from './offline'
export { apiEnabled, type User } from './http'
export async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  if (method !== 'GET' && /^service-orders\/[^/]+(?:\/(?:technical-report|photos))?$/.test(path) && await isOfflinePrepared()) return queueOffline<T>(path, method, data)
  if (!navigator.onLine && !path.startsWith('auth/')) return method === 'GET' ? cachedResource<T>(path) : queueOffline<T>(path, method, data)
  if (!path.startsWith('auth/') && await hasPendingOrder(path)) {
    if (method !== 'GET') return queueOffline<T>(path, method, data)
    if (path.endsWith('/photos')) return cachedResource<T>(path)
  }
  try { return await overlayOrders(path, await requestOnline<T>(path, method, data)) }
  catch (error) {
    if (!(error instanceof ApiError) && error instanceof TypeError && !path.startsWith('auth/')) return method === 'GET' ? cachedResource<T>(path) : queueOffline<T>(path, method, data)
    throw error
  }
}
