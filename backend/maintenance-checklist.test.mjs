import test from 'node:test'
import assert from 'node:assert/strict'
import { checklistCatalog, validateChecklist } from './maintenance-checklist.mjs'
import { validateTechnicalReport } from './schema.mjs'
const make = model => ({ version: 1, modelId: model.id, items: Object.fromEntries(model.items.map(item => [item.id, { status: 'Pendente', notes: '' }])), measurements: {} })
test('checklists: seis modelos, limites de medições, campos permitidos e compatibilidade legada', () => {
  assert.deepEqual(checklistCatalog.models.map(model => model.name), ['Split', 'VRF', 'Ventilador', 'Exaustor', 'Climatizador', 'Fancoil'])
  const legacy = { diagnosis: 'Inspecionado', workPerformed: 'Manutenção', materialsUsed: '', recommendations: '', technicianId: 'tech', updatedAt: new Date().toISOString() }
  validateTechnicalReport(legacy)
  validateTechnicalReport({ ...legacy, checklist: null })
  for (const model of checklistCatalog.models) {
    const checklist = make(model)
    validateChecklist(checklist)
    checklist.items[model.items[0].id] = { status: 'Não conforme', notes: 'Substituir componente' }
    for (const field of model.measurements) checklist.measurements[field.id] = field.min
    validateTechnicalReport({ ...legacy, checklist })
    for (const field of model.measurements) {
      assert.throws(() => validateChecklist({ ...checklist, measurements: { [field.id]: field.max + 1 } }), { status: 400 })
      assert.throws(() => validateChecklist({ ...checklist, measurements: { [field.id]: '12,5' } }), { status: 400 })
    }
    for (const bad of [
      { ...checklist, version: 2 }, { ...checklist, modelId: 'unknown' },
      { ...checklist, items: {} }, { ...checklist, items: [] },
      { ...checklist, measurements: { pressure: 3 } },
      { ...checklist, measurements: { voltage: NaN } },
      { ...checklist, measurements: { voltage: null } },
      { ...checklist, measurements: { voltage: Infinity } },
      { ...checklist, items: { ...checklist.items, [model.items[0].id]: { status: 'Aprovado', notes: '' } } },
      { ...checklist, items: { ...checklist.items, [model.items[0].id]: { status: 'Conforme', notes: 'a'.repeat(1001) } } },
    ]) assert.throws(() => validateChecklist(bad), { status: 400 })
  }
})

test('checklists: fotos por item e componentes validam escopo, fases, limites e identidade', async () => {
  const { evidenceChecklist } = await import('./fixtures/report-evidence.mjs')
  const { randomUUID } = await import('node:crypto')
  const source = evidenceChecklist()
  validateChecklist(source)
  const bad = change => { const copy = structuredClone(source); change(copy); assert.throws(() => validateChecklist(copy), { status: 400 }) }
  bad(copy => { copy.components[0].readings.voltage = 220 })
  bad(copy => { copy.components[1].readings.voltageRS = 220 })
  bad(copy => { copy.components[0].readings.currentR = -1 })
  bad(copy => { copy.components[0].readings.currentT = '3,3' })
  bad(copy => { copy.components[0].readings.currentT = Infinity })
  bad(copy => { copy.components[0].label = ' ' })
  bad(copy => { copy.components[0].kind = 'Desconhecido' })
  bad(copy => { copy.components[0].supply = 'bifasico' })
  bad(copy => { copy.components[1].id = copy.components[0].id })
  bad(copy => { copy.components = Array.from({ length: 21 }, () => ({ ...copy.components[0], id: randomUUID() })) })
  bad(copy => { copy.items.filters.photos[0].data = 'data:image/svg+xml;base64,AAAA' })
  bad(copy => { copy.items.filters.photos[0].caption = 'x'.repeat(301) })
  bad(copy => { copy.items.filters.photos[0].data = 'data:image/jpeg;base64,' + Buffer.alloc(307201).toString('base64') })
  bad(copy => { copy.items.filters.photos = Array(3).fill(copy.items.filters.photos[0]).map(photo => ({ ...photo, id: randomUUID() })) })
  bad(copy => { copy.items.coil.photos = [copy.items.filters.photos[0]] })
  bad(copy => { for (const entry of Object.values(copy.items)) entry.photos = Array.from({ length: 2 }, () => ({ ...copy.items.filters.photos[0], id: randomUUID() })) })
  const max = structuredClone(source)
  let count = 0
  for (const entry of Object.values(max.items)) entry.photos = count++ < 12 ? [0, 1].map(() => ({ ...source.items.filters.photos[0], id: randomUUID() })) : []
  validateChecklist(max)
})
