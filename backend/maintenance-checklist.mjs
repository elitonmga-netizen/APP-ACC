import catalog from '../shared/maintenance-checklists.json' with { type: 'json' }
import { HttpError } from './schema.mjs'
export { catalog as checklistCatalog }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key))
export function validateChecklist(value) {
  if (value === undefined || value === null) return
  const invalid = () => { throw new HttpError(400, 'Checklist ou medições inválidos. Revise os campos antes de salvar.') }
  if (!only(value, ['version', 'modelId', 'items', 'measurements']) || value.version !== 1) invalid()
  const model = catalog.models.find(item => item.id === value.modelId)
  if (!model || !only(value.items, model.items.map(item => item.id)) || Object.keys(value.items).length !== model.items.length || !only(value.measurements, model.measurements.map(item => item.id))) invalid()
  for (const item of model.items) {
    const entry = value.items[item.id]
    if (!only(entry, ['status', 'notes']) || !catalog.statuses.includes(entry.status) || typeof entry.notes !== 'string' || entry.notes.length > 1000) invalid()
  }
  for (const [id, reading] of Object.entries(value.measurements)) {
    const field = model.measurements.find(item => item.id === id)
    if (typeof reading !== 'number' || !Number.isFinite(reading) || reading < field.min || reading > field.max) invalid()
  }
}
