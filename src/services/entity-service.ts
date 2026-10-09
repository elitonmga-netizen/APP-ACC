import { apiEnabled, request } from './api'
export interface EntityService<T extends { id: string }> {
  list(): T[]; load(): Promise<T[]>; findById(id: string): T | undefined
  create(item: T): Promise<T>; update(id: string, patch: Partial<T>): Promise<T | undefined>; remove(id: string): Promise<void>
}
export function createEntityService<T extends { id: string }>(records: T[], resource: string): EntityService<T> {
  const replace = (items: T[]) => { records.splice(0, records.length, ...items); return [...records] }
  return {
    list: () => [...records], findById: id => records.find(record => record.id === id),
    load: async () => apiEnabled ? replace(await request<T[]>(resource)) : [...records],
    create: async item => {
      const data: Partial<T> = { ...item }; delete data.id
      const saved = apiEnabled ? await request<T>(resource, 'POST', data) : item
      records.unshift(saved); return saved
    },
    update: async (id, patch) => {
      const index = records.findIndex(record => record.id === id); if (index < 0) return undefined
      const data = { ...patch }; delete data.id
      const saved = apiEnabled ? await request<T>(`${resource}/${encodeURIComponent(id)}`, 'PATCH', data) : { ...records[index], ...data }
      records[index] = saved; return saved
    },
    remove: async id => { if (apiEnabled) await request(`${resource}/${encodeURIComponent(id)}`, 'DELETE'); replace(records.filter(record => record.id !== id)) },
  }
}
