import test from 'node:test'
import assert from 'node:assert/strict'
import { generateReportPdf, reportFilename } from './report-pdf.mjs'

test('PDF: relatório longo é paginado e funciona sem fotos ou cadastros opcionais', async () => {
  const pdf = await generateReportPdf({
    order: { code: 'OS-001', status: 'Concluída', scheduledFor: '19/10/2026', description: 'Manutenção preventiva', technicalReport: { diagnosis: 'Verificação de pressão, óleo e ventilação. '.repeat(120), workPerformed: 'Limpeza, higienização e aferição. '.repeat(140), materialsUsed: '', recommendations: 'Retorno em 30 dias.', updatedAt: '2026-10-19T01:00:00Z' } },
    photos: [], generatedAt: new Date('2026-10-19T01:30:00Z'),
  })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.match(pdf.subarray(-50).toString(), /%%EOF/)
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 3)
  assert.match(pdf.toString('latin1'), /\/BaseFont \/Helvetica/)
})

test('PDF: nome do arquivo não permite injetar cabeçalhos ou caminhos', () => {
  const name = reportFilename('OS/\r\n"../../001')
  assert.match(name, /^relatorio-tecnico-[a-zA-Z0-9_-]+\.pdf$/)
  assert.ok(reportFilename('A'.repeat(2000)).length < 110)
})

test('PDF: rodapé não cria páginas vazias em relatório curto', async () => {
  const pdf = await generateReportPdf({ order: { code: 'OS-2', status: 'Concluída', technicalReport: { diagnosis: 'Filtro obstruído.', workPerformed: 'Limpeza.', updatedAt: '2026-10-19T00:00:00Z' } }, photos: [] })
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1)
})

test('PDF: checklist completo com observações longas, zero medido e temperaturas da água', async () => {
  const { checklistCatalog } = await import('./maintenance-checklist.mjs')
  const { inflateSync } = await import('node:zlib')
  const model = checklistCatalog.models.find(item => item.id === 'fancoil')
  const checklist = { version: 1, modelId: model.id, items: Object.fromEntries(model.items.map(item => [item.id, { status: 'Não conforme', notes: 'Revisar componente. '.repeat(40) + 'FINAL-OBSERVACAO' }])), measurements: { current: 0, waterIn: 7, waterOut: 12 } }
  const pdf = await generateReportPdf({ order: { code: 'OS-CHECKLIST', status: 'Concluída', technicalReport: { diagnosis: 'Inspeção', workPerformed: 'Manutenção', updatedAt: new Date().toISOString(), checklist } }, photos: [] })
  let text = ''
  for (const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const stream = inflateSync(Buffer.from(match[1], 'latin1')).toString()
    text += [...stream.matchAll(/<([a-f\d]+)>/gi)].map(token => Buffer.from(token[1], 'hex').toString('latin1')).join('')
  }
  assert.match(text, /Checklist de manutenção - Fancoil/)
  for (const item of model.items) assert.ok(text.includes(item.label), item.label)
  assert.equal((text.match(/FINAL-OBSERVACAO/g) || []).length, model.items.length)
  assert.match(text, /Corrente: 0 A/)
  assert.match(text, /Tensão: Não medido/)
  assert.match(text, /Temperatura de entrada da água: 7 °C/)
  assert.match(text, /Temperatura de saída da água: 12 °C/)
})

test('PDF: foto acompanha o item e cada componente mantém tensão e corrente por fase', async () => {
  const { evidenceChecklist } = await import('./fixtures/report-evidence.mjs')
  const { inflateSync } = await import('node:zlib')
  const checklist = evidenceChecklist()
  const input = { order: { code: 'OS-EVIDENCIAS', status: 'Concluída', technicalReport: { diagnosis: 'Inspeção', workPerformed: 'Manutenção', updatedAt: new Date().toISOString(), checklist } }, photos: [] }
  const pdf = await generateReportPdf(input)
  assert.equal((pdf.toString('latin1').match(/\/Subtype \/Image\b/g) || []).length, 1)
  let text = ''
  for (const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream
    try { stream = inflateSync(Buffer.from(match[1], 'latin1')).toString() } catch { continue } // JPEG streams are not Flate.
    text += [...stream.matchAll(/<([a-f\d]+)>/gi)].map(token => Buffer.from(token[1], 'hex').toString('latin1')).join('')
  }
  assert.ok(text.indexOf('Foto do item - Filtros de ar') < text.indexOf('FOTO-FILTRO-VINCULADA'))
  assert.ok(text.indexOf('FOTO-FILTRO-VINCULADA') < text.indexOf('Serpentina / trocador'))
  for (const expected of ['Compressor - CP-01', 'Tensão R-S: 221 V', 'Tensão S-T: 222 V', 'Tensão R-T: 223 V', 'Corrente R: 0 A', 'Corrente S: 3,2 A', 'Corrente T: 3,3 A', 'Motor do evaporador - EV-02', 'Tensão de alimentação: 224 V', 'Corrente: 1,7 A']) assert.ok(text.includes(expected), expected)
  checklist.items.filters.photos[0].data = 'data:image/jpeg;base64,/9j/2Q=='
  await assert.rejects(generateReportPdf(input))
})
