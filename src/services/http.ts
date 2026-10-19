export const apiEnabled = import.meta.env.VITE_DATA_MODE === 'api'
export type User = { id: string; name: string; email: string; role: 'Administrador' | 'Gestor' | 'Técnico' | 'Operador'; active?: boolean; technicianId?: string | null }
const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
async function requestResponse(path: string, method = 'GET', data?: unknown): Promise<Response> {
  const response = await fetch(`${apiBase}/api/${path}`, {
    signal: AbortSignal.timeout(path.endsWith('/offline-sync') ? 120000 : 15000),
    method, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-ACC-Request': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
  }).catch(() => { throw new TypeError('Não foi possível conectar ao servidor. Seus rascunhos locais permanecem guardados.') })
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new ApiError(result.error || 'Não foi possível acessar a API.', response.status) }
  return response
}
export async function requestOnline<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await requestResponse(path, method, data)
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
export async function downloadReportPdf(orderId: string, code: string): Promise<void> {
  const response = await requestResponse(`service-orders/${encodeURIComponent(orderId)}/report.pdf`)
  if (!response.headers.get('Content-Type')?.startsWith('application/pdf')) throw new Error('O servidor não retornou um PDF. Atualize o aplicativo e tente novamente.')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `relatorio-tecnico-${code.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'OS'}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Android may start the download after this event handler returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
