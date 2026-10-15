export const apiEnabled = import.meta.env.VITE_DATA_MODE === 'api'
export type User = { id: string; name: string; email: string; role: 'Administrador' | 'Gestor' | 'Técnico' | 'Operador'; active?: boolean; technicianId?: string | null }
const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
export async function requestOnline<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}/api/${path}`, {
    signal: AbortSignal.timeout(path.endsWith('/offline-sync') ? 120000 : 15000),
    method, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-ACC-Request': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
  }).catch(() => { throw new TypeError('Não foi possível conectar ao servidor. Seus rascunhos locais permanecem guardados.') })
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new ApiError(result.error || 'Não foi possível acessar a API.', response.status) }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
