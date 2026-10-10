export const apiEnabled = import.meta.env.VITE_DATA_MODE === 'api'
export type User = { id: string; name: string; email: string; role: 'Administrador' | 'Gestor' | 'Técnico' | 'Operador'; active?: boolean; technicianId?: string | null }
const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
export async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}/api/${path}`, {
    method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-ACC-Request': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Não foi possível acessar a API.') }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
