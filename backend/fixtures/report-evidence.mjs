import { randomUUID } from 'node:crypto'
import { checklistCatalog } from '../maintenance-checklist.mjs'
export const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlqKKK9A+bP//Z'
// A legal JPEG comment makes the report exceed the former 32 KB body limit.
const source = Buffer.from(jpeg.split(',')[1], 'base64')
const comment = Buffer.concat([Buffer.from([255, 254, 195, 82]), Buffer.alloc(50000, 65)])
export const largeJpeg = 'data:image/jpeg;base64,' + Buffer.concat([source.subarray(0, 2), comment, source.subarray(2)]).toString('base64')
export function evidenceChecklist() {
  const model = checklistCatalog.models.find(item => item.id === 'fancoil')
  return { version: 1, modelId: model.id, items: Object.fromEntries(model.items.map((item, index) => [item.id, { status: index === 0 ? 'Não conforme' : 'Conforme', notes: index === 0 ? 'Filtro obstruído.' : '', photos: index === 0 ? [{ id: randomUUID(), data: largeJpeg, caption: 'FOTO-FILTRO-VINCULADA' }] : [] }])), measurements: { waterIn: 7, waterOut: 12 }, circuits: [
    { id: randomUUID(), label: 'Circuito BAR', unit: 'bar', high: 28.5, low: 0, notes: 'Leitura de ensaio' },
    { id: randomUUID(), label: 'Circuito PSI', unit: 'psi', high: 410, low: 112.5, notes: '' },
    { id: randomUUID(), label: 'Circuito MPA', unit: 'MPa', low: -0.02, notes: '' },
  ], components: [
    { id: randomUUID(), kind: 'Compressor', label: 'CP-01', supply: 'tri', readings: { voltageRS: 221, voltageST: 222, voltageRT: 223, currentR: 0, currentS: 3.2, currentT: 3.3 }, notes: 'Inspeção do compressor' },
    { id: randomUUID(), kind: 'Motor do evaporador', label: 'EV-02', supply: 'mono', readings: { voltage: 224, current: 1.7 }, notes: '' },
  ] }
}
