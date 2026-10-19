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
