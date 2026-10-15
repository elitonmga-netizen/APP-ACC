import type { ServiceOrder, TechnicalReport } from '../models/operational'
import { ApiError, requestOnline, type User } from './http'
type Photo = { id: string; stage: 'Antes' | 'Depois'; caption: string; data: string; createdAt: string }
type Report = Pick<TechnicalReport, 'diagnosis' | 'workPerformed' | 'materialsUsed' | 'recommendations'>
type Draft = { locked?: boolean; operationId: string; base: { status: string; reportUpdatedAt: string }; status?: ServiceOrder['status']; report?: Report; photos: Pick<Photo, 'stage' | 'caption' | 'data'>[] }
type Snapshot = { user: User; expiresAt: number; enabled: boolean; resources: Record<string, { id: string }[]>; photos: Record<string, Photo[]>; drafts: Record<string, Draft> }
let currentUser: User | null = null
let syncing = false
let serial: Promise<unknown> = Promise.resolve()
const emit = () => window.dispatchEvent(new Event('acc-offline-change'))
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('acc-field-offline-v1', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('device')
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(new Error('Não foi possível abrir o armazenamento offline.'))
  })
}
async function storage(write?: Snapshot | null): Promise<Snapshot | undefined> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('device', write === undefined ? 'readonly' : 'readwrite')
      const objectStore = tx.objectStore('device')
      const operation = write === undefined ? objectStore.get('snapshot') : write === null ? objectStore.delete('snapshot') : objectStore.put(write, 'snapshot')
      let result: Snapshot | undefined
      operation.onsuccess = () => { result = operation.result as Snapshot | undefined }
      tx.oncomplete = () => resolve(write === undefined ? result : write || undefined)
      tx.onerror = tx.onabort = () => reject(new Error('Não foi possível salvar no celular. Verifique o espaço disponível; o envio não foi confirmado.'))
    })
  } finally { db.close() }
}
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = () => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('acc-offline-store', task) : task()
  const next = serial.then(run, run)
  serial = next.catch(() => {})
  return next
}
export function setOfflineUser(user: User | null) { currentUser = user }
async function owned() {
  if (currentUser?.role !== 'Técnico') return undefined
  const state = await storage().catch(() => undefined)
  return state && state.enabled && state.user.id === currentUser?.id ? state : undefined
}
export async function checkOfflineIdentity(user: User) { const state = await storage().catch(() => undefined); if (state && state.user.id !== user.id && Object.keys(state.drafts).length) throw new Error('Há rascunhos de outra conta neste aparelho. Entre na conta anterior para sincronizar.') }
export async function resumeOfflineUser() {
  const state = await storage().catch(() => undefined)
  if (state?.enabled && state.expiresAt > Date.now() && state.user.role === 'Técnico') { currentUser = state.user; return state.user }
  return null
}
export async function offlineInfo() {
  const state = await owned()
  return { enabled: !!state, pending: Object.keys(state?.drafts || {}).length, expiresAt: state?.expiresAt || 0, syncing }
}
export async function prepareOffline(user: User) {
  if (user.role !== 'Técnico' || !user.technicianId) throw new Error('Offline disponível apenas para o perfil Técnico vinculado.')
  await exclusive(async () => {
    const previous = await storage()
    if (previous && previous.user.id !== user.id && Object.keys(previous.drafts).length) throw new Error('Há rascunhos de outro usuário neste celular. Entre na conta anterior para sincronizá-los.')
    const resources: Snapshot['resources'] = {}
    for (const resource of ['clients', 'locations', 'equipment', 'service-orders', 'maintenance', 'technicians', 'climate-systems']) resources[resource] = await requestOnline<{ id: string }[]>(resource)
    const orders = resources['service-orders'] as ServiceOrder[]
    if (orders.length > 20) throw new Error('Este modo offline inicial suporta até 20 OS atribuídas. Reduza a quantidade antes de preparar.')
    const photos: Snapshot['photos'] = {}
    let size = 0
    for (const order of orders) {
      photos[order.id] = await requestOnline<Photo[]>(`service-orders/${encodeURIComponent(order.id)}/photos`)
      size += JSON.stringify(photos[order.id]).length
      if (size > 30000000) throw new Error('Fotos das OS ultrapassam 30 MB. Reduza as OS atribuídas antes de preparar este celular.')
    }
    const drafts = previous?.user.id === user.id ? previous.drafts : {}
    await storage({ user, enabled: true, expiresAt: Date.now() + 8 * 60 * 60 * 1000, resources, photos, drafts })
    currentUser = user; emit()
  })
}
export async function releaseOffline() {
  await exclusive(async () => {
    const state = await storage().catch(() => undefined)
    if (!state) return
    if (state && Object.keys(state.drafts).length) throw new Error('Sincronize os rascunhos antes de sair. Nada foi apagado.')
    await storage(null); emit()
  })
}
function overlay(state: Snapshot, order: ServiceOrder): ServiceOrder {
  const draft = state.drafts[order.id]
  return draft ? { ...order, status: draft.status || order.status, ...(draft.report ? { technicalReport: { ...draft.report, technicianId: state.user.technicianId!, updatedAt: new Date(0).toISOString() } } : {}) } : order
}
export async function cachedResource<T>(path: string): Promise<T> {
  const state = await owned()
  if (!state || state.expiresAt <= Date.now()) throw new Error('Conecte-se e prepare as OS para uso offline. A autorização offline dura 8 horas; os rascunhos permanecem guardados.')
  const [resource, id, action] = path.split('/')
  const decoded = id && decodeURIComponent(id)
  if (resource === 'service-orders' && action === 'photos') {
    const base = state.photos[decoded] || []
    const extra = (state.drafts[decoded]?.photos || []).map((photo, index) => ({ ...photo, id: `pending-${index}`, createdAt: new Date(0).toISOString() }))
    return [...base, ...extra] as T
  }
  const values = state.resources[resource]
  if (!values) throw new Error('Esta consulta requer conexão com a internet.')
  const result = resource === 'service-orders' ? (values as ServiceOrder[]).map(order => overlay(state, order)) : values
  return (decoded ? result.find(item => item.id === decoded) : result) as T
}
export async function isOfflinePrepared() { return !!await owned() }
export async function hasPendingOrder(path: string) {
  const state = await owned()
  const [resource, id] = path.split('/')
  return !!state && resource === 'service-orders' && !!state.drafts[decodeURIComponent(id || '')]
}
export async function queueOffline<T>(path: string, method: string, data: unknown): Promise<T> {
  if (syncing) throw new Error('Aguarde a sincronização terminar antes de editar.')
  return exclusive(async () => {
    const state = await owned()
    if (!state || state.expiresAt <= Date.now()) throw new Error('Prepare este celular conectado antes de salvar offline.')
    const [resource, rawId, action] = path.split('/')
    const id = decodeURIComponent(rawId || '')
    const order = (state.resources['service-orders'] as ServiceOrder[]).find(item => item.id === id)
    if (resource !== 'service-orders' || !order || order.technicianId !== state.user.technicianId) throw new Error('Ordem não preparada para uso offline.')
    const draft: Draft = state.drafts[id] || { operationId: crypto.randomUUID(), base: { status: order.status, reportUpdatedAt: order.technicalReport?.updatedAt || '' }, photos: [] }
    if (draft.locked) throw new Error('Este rascunho aguarda confirmação. Sincronize novamente ou revise o conflito antes de editar.')
    let result: unknown
    if (action === 'photos' && method === 'POST') {
      if ((state.photos[id]?.length || 0) + draft.photos.length >= 12) throw new Error('Limite de 12 fotos por OS atingido.')
      draft.photos.push(data as Draft['photos'][number])
      result = { ...(data as object), id: crypto.randomUUID(), createdAt: new Date(0).toISOString() }
    } else if (action === 'technical-report' && method === 'PATCH') { draft.report = data as Report }
    else if (!action && method === 'PATCH') {
      const status = (data as { status: ServiceOrder['status'] }).status
      const existing = draft.status || order.status
      if (!(existing === 'Agendada' && status === 'Em andamento' || existing === 'Em andamento' && status === 'Concluída')) throw new Error('Transição de status inválida.')
      draft.status = status
    } else throw new Error('Esta alteração requer internet.')
    draft.operationId = crypto.randomUUID()
    state.drafts[id] = draft
    if (JSON.stringify(state).length > 45000000) throw new Error('Limite offline do celular atingido. Sincronize antes de anexar mais fotos.')
    await storage(state); emit()
    return (result || overlay(state, order)) as T
  })
}
export async function overlayOrders<T>(path: string, online: T): Promise<T> {
  const state = await owned()
  if (!state || path !== 'service-orders') return online
  return (online as ServiceOrder[]).map(order => overlay(state, order)) as T
}
export async function syncOffline() {
  if (syncing) return
  syncing = true; emit()
  try {
    await exclusive(async () => {
      const state = await owned()
      if (!state || !Object.keys(state.drafts).length) return
      const authenticated = await requestOnline<User>('auth/me')
      if (authenticated.id !== state.user.id || authenticated.role !== 'Técnico' || authenticated.technicianId !== state.user.technicianId) throw new Error('Entre novamente na conta do técnico que criou os rascunhos.')
      for (const [id, draft] of Object.entries(state.drafts)) {
        draft.locked = true
        await storage(state)
        const { locked: _locked, ...payload } = draft
        void _locked
        const saved = await requestOnline<ServiceOrder>(`service-orders/${encodeURIComponent(id)}/offline-sync`, 'POST', payload)
        state.resources['service-orders'] = state.resources['service-orders'].map(order => order.id === id ? saved : order)
        // A confirmação é gravada antes de consultar novamente as fotos.
        state.photos[id] = [...(state.photos[id] || []), ...draft.photos.map((photo, index) => ({ ...photo, id: `${draft.operationId}-${index}`, createdAt: new Date().toISOString() }))]
        delete state.drafts[id]
        await storage(state); emit()
        state.photos[id] = await requestOnline<Photo[]>(`service-orders/${encodeURIComponent(id)}/photos`)
        await storage(state)
      }
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error('Sua sessão expirou. Conecte-se e entre novamente para sincronizar; rascunhos preservados.')
    throw error
  } finally { syncing = false; emit() }
}
export async function draftSummary() {
  const state = await owned()
  return Object.entries(state?.drafts || {}).map(([id, draft]) => ({ id, code: (state!.resources['service-orders'] as ServiceOrder[]).find(order => order.id === id)?.code || id, report: draft.report, status: draft.status, photos: draft.photos.length }))
}
export async function discardDraft(id: string) {
  if (syncing) throw new Error('Aguarde a sincronização terminar.')
  await exclusive(async () => { const state = await owned(); if (state) { delete state.drafts[id]; await storage(state); emit() } })
}
