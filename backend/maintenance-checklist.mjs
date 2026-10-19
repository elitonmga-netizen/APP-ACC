import pressureUnits from '../shared/pressure-units.json' with { type: 'json' }
import catalog from '../shared/maintenance-checklists.json' with { type: 'json' }
import electrical from '../shared/electrical-components.json' with { type: 'json' }
import { HttpError } from './schema.mjs'
export { catalog as checklistCatalog, electrical as electricalCatalog }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key))
export function validateChecklist(value) {
  if (value === undefined || value === null) return
  const invalid = () => { throw new HttpError(400, 'Checklist ou medições inválidos. Revise os campos antes de salvar.') }
  if (!only(value, ['version', 'modelId', 'items', 'measurements', 'components', 'circuits']) || value.version !== 1) invalid()
  const model = catalog.models.find(item => item.id === value.modelId)
  if (!model || !only(value.items, model.items.map(item => item.id)) || Object.keys(value.items).length !== model.items.length || !only(value.measurements, model.measurements.map(item => item.id))) invalid()
  let photoCount = 0
  const photoIds = new Set()
  for (const item of model.items) {
    const entry = value.items[item.id]
    if (!only(entry, ['status', 'notes', 'photos']) || !catalog.statuses.includes(entry.status) || typeof entry.notes !== 'string' || entry.notes.length > 1000) invalid()
    if (entry.photos !== undefined) {
      if (!Array.isArray(entry.photos) || entry.photos.length > 2) invalid()
      for (const photo of entry.photos) {
        if (!only(photo, ['id', 'data', 'caption']) || typeof photo.id !== 'string' || !/^[a-f0-9-]{36}$/.test(photo.id) || photoIds.has(photo.id) || typeof photo.caption !== 'string' || photo.caption.length > 300 || !validJpeg(photo.data)) invalid()
        photoIds.add(photo.id); photoCount++
      }
    }
  }
  if (photoCount > 24) invalid()
  if (value.components !== undefined) {
    if (!Array.isArray(value.components) || value.components.length > 20) invalid()
    const ids = new Set()
    for (const component of value.components) {
      if (!only(component, ['id', 'kind', 'label', 'supply', 'readings', 'notes']) || typeof component.id !== 'string' || !/^[a-f0-9-]{36}$/.test(component.id) || ids.has(component.id) || !electrical.kinds.includes(component.kind) || typeof component.label !== 'string' || !component.label.trim() || component.label.length > 100 || typeof component.notes !== 'string' || component.notes.length > 1000) invalid()
      ids.add(component.id)
      const supply = electrical.supplies.find(item => item.id === component.supply)
      if (!supply || !only(component.readings, supply.fields.map(field => field.id))) invalid()
      for (const [key, reading] of Object.entries(component.readings)) {
        const field = supply.fields.find(item => item.id === key)
        if (typeof reading !== 'number' || !Number.isFinite(reading) || reading < 0 || reading > field.max) invalid()
      }
    }
  }
  if (value.circuits !== undefined) {
    if (!Array.isArray(value.circuits) || value.circuits.length > 20) invalid()
    const ids = new Set()
    for (const circuit of value.circuits) {
      if (!only(circuit, ['id', 'label', 'unit', 'high', 'low', 'notes']) || typeof circuit.id !== 'string' || !/^[a-f0-9-]{36}$/.test(circuit.id) || ids.has(circuit.id) || typeof circuit.label !== 'string' || !circuit.label.trim() || circuit.label.length > 100 || typeof circuit.notes !== 'string' || circuit.notes.length > 1000) invalid()
      ids.add(circuit.id)
      const unit = pressureUnits.find(item => item.id === circuit.unit)
      if (!unit) invalid()
      for (const key of ['high', 'low']) {
        const reading = circuit[key]
        if (reading !== undefined && (typeof reading !== 'number' || !Number.isFinite(reading) || reading < unit.min || reading > unit.max)) invalid()
      }
    }
  }
  for (const [id, reading] of Object.entries(value.measurements)) {
    const field = model.measurements.find(item => item.id === id)
    if (typeof reading !== 'number' || !Number.isFinite(reading) || reading < field.min || reading > field.max) invalid()
  }
}

export function validJpeg(data) {
  if (typeof data !== 'string' || data.length > 409623) return false
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data)
  if (!match) return false
  const image = Buffer.from(match[1], 'base64')
  return image.length >= 4 && image.length <= 307200 && image[0] === 255 && image[1] === 216 && image[2] === 255 && image.at(-2) === 255 && image.at(-1) === 217 && image.toString('base64') === match[1]
}
