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
