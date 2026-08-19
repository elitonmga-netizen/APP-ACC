export interface EntityService<T extends { id: string }> { list(): T[]; findById(id: string): T | undefined; create(item: T): T; update(id: string, patch: Partial<T>): T | undefined }
export function createEntityService<T extends { id: string }>(seed: T[]): EntityService<T> {
  let records = [...seed]
  return { list: () => [...records], findById: (id) => records.find((record) => record.id === id), create: (item) => { records = [item, ...records]; return item }, update: (id, patch) => { const index = records.findIndex((record) => record.id === id); if (index < 0) return undefined; records[index] = { ...records[index], ...patch }; return records[index] } }
}
