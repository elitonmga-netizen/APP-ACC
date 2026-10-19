import { checklistCatalog, electricalCatalog } from './maintenance-checklist.mjs'
import PDFDocument from 'pdfkit'

const dateTime = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Não informado'
}
export const reportFilename = code => `relatorio-tecnico-${String(code).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'OS'}.pdf`

// Reads only the order snapshot supplied by the authenticated route. No external URLs.
export function generateReportPdf({ order, client, location, equipment, system, technician, photos, generatedAt = new Date() }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 105, bottom: 55, left: 45, right: 45 }, bufferPages: true, info: { Title: `Relatório técnico - ${order.code}`, Author: 'ACC Climatização', Subject: 'Atendimento e registro fotográfico' } })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    const width = doc.page.width - 90
    const header = () => {
      doc.fillColor('#173B50').font('Helvetica-Bold').fontSize(17).text('ACC CLIMATIZAÇÃO', 45, 33, { width, lineBreak: false })
      doc.font('Helvetica').fontSize(10).fillColor('#516574').text('RELATÓRIO TÉCNICO DE ATENDIMENTO', 45, 58, { width, lineBreak: false })
      doc.moveTo(45, 81).lineTo(doc.page.width - 45, 81).strokeColor('#B9CED6').lineWidth(1).stroke()
      doc.font('Helvetica').fontSize(10).fillColor('#253744')
      doc.x = 45; doc.y = 105
    }
    header()
    doc.on('pageAdded', header)
    const section = title => {
      if (doc.y > doc.page.height - 115) doc.addPage()
      doc.moveDown(0.7)
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#173B50').text(title, 45, doc.y, { width })
      doc.moveDown(0.4)
    }
    const field = (label, value) => {
      if (doc.y > doc.page.height - 95) doc.addPage()
      doc.font('Helvetica').fontSize(10).fillColor('#253744').text(`${label}: ${value || 'Não informado'}`, 45, doc.y, { width, lineGap: 3 })
      doc.moveDown(0.3)
    }
    const textSection = (label, value) => {
      section(label)
      doc.font('Helvetica').fontSize(10).fillColor('#253744').text(value || 'Não informado', 45, doc.y, { width, lineGap: 4 })
    }
    try {
      field('Ordem de serviço', order.code)
      field('Status', order.status)
      field('Agendamento', order.scheduledFor)
      field('Técnico responsável pelo relatório', technician?.name)
      field('Relatório atualizado em', dateTime(order.technicalReport.updatedAt))
      field('PDF emitido em', dateTime(generatedAt))
      section('Cliente e local do atendimento')
      field('Cliente', client?.name)
      field('CPF / CNPJ', client?.document)
      field('Unidade', location?.name)
      field('Endereço', location?.address)
      field('Cidade', location?.city)
      section('Equipamento')
      field('Identificação', equipment?.tag)
      field('Equipamento', equipment?.name)
      field('Sistema', system ? `${system.name} - ${system.type}` : '')
      field('Capacidade', system?.capacity)
      field('Fluido refrigerante', system?.refrigerant)
      textSection('Solicitação / escopo da OS', order.description)
      for (const [label, key] of [['Diagnóstico', 'diagnosis'], ['Serviço executado', 'workPerformed'], ['Materiais utilizados', 'materialsUsed'], ['Recomendações', 'recommendations']]) textSection(label, order.technicalReport[key])

      const checklist = order.technicalReport.checklist
      const model = checklistCatalog.models.find(item => item.id === checklist?.modelId)
      if (model && checklist) {
        section(`Checklist de manutenção - ${model.name}`)
        const pending = model.items.filter(item => checklist.items[item.id]?.status === 'Pendente').length
        const issues = model.items.filter(item => checklist.items[item.id]?.status === 'Não conforme').length
        field('Resumo', `${issues} não conformidade(s) / ${pending} item(ns) pendente(s)`)
        for (const item of model.items) {
          const entry = checklist.items[item.id]
          field(item.label, entry?.status || 'Pendente')
          if (entry?.notes) field('Observação', entry.notes)
          for (const [index, photo] of (entry?.photos || []).entries()) {
            const caption = photo.caption || 'Sem legenda'
            const captionHeight = doc.font('Helvetica').fontSize(9).heightOfString(caption, { width, lineGap: 2 })
            if (doc.y + 260 + captionHeight > doc.page.height - 55) doc.addPage()
            section(`Foto do item - ${item.label} (${index + 1})`)
            const top = doc.y
            doc.image(Buffer.from(photo.data.replace(/^data:image\/jpeg;base64,/, ''), 'base64'), 45, top, { fit: [width, 200], align: 'center', valign: 'center' })
            doc.font('Helvetica').fontSize(9).fillColor('#253744').text(caption, 45, top + 210, { width, lineGap: 2 })
            doc.moveDown(0.6)
          }
        }
        if (checklist.components?.length) {
          section('Medições elétricas por componente')
          for (const component of checklist.components) {
            const supply = electricalCatalog.supplies.find(item => item.id === component.supply)
            section(`${component.kind} - ${component.label}`)
            field('Alimentação', supply.label)
            for (const readingField of supply.fields) {
              const reading = component.readings[readingField.id]
              // PDFKit's standard font uses WinAnsi: a simple hyphen keeps phase labels portable.
              field(readingField.label.replaceAll('–', '-'), reading === undefined ? 'Não medido' : `${reading.toLocaleString('pt-BR')} ${readingField.unit}`)
            }
            if (component.notes) field('Observações do componente', component.notes)
          }
        }
        const hasLegacyElectrical = ['voltage', 'current'].some(key => checklist.measurements[key] !== undefined)
        if (hasLegacyElectrical) section('Medições elétricas gerais anteriores')
        for (const measurement of model.measurements.filter(field => ['voltage', 'current'].includes(field.id))) {
          if (!hasLegacyElectrical) continue
          const reading = checklist.measurements[measurement.id]
          field(measurement.label, reading === undefined ? 'Não medido' : `${reading.toLocaleString('pt-BR')} ${measurement.unit}`)
        }
        const temperatures = model.measurements.filter(field => !['voltage', 'current'].includes(field.id))
        if (temperatures.length) section('Temperaturas')
        for (const measurement of temperatures) {
          const reading = checklist.measurements[measurement.id]
          field(measurement.label, reading === undefined ? 'Não medido' : `${reading.toLocaleString('pt-BR')} ${measurement.unit}`)
        }
      }

      if (!photos.length) textSection('Registro fotográfico geral', 'Nenhuma foto geral de antes ou depois anexada a esta ordem de serviço.')
      else {
        for (const stage of ['Antes', 'Depois']) {
          const stagePhotos = photos.filter(photo => photo.stage === stage)
          if (!stagePhotos.length) continue
          doc.addPage()
          section(`Registro fotográfico - ${stage}`)
          let count = 0
          for (const photo of stagePhotos) {
            if (count > 0 && count % 2 === 0) { doc.addPage(); section(`Registro fotográfico - ${stage} (continuação)`) }
            const top = doc.y
            const image = Buffer.from(photo.data.replace(/^data:image\/jpeg;base64,/, ''), 'base64')
            // image() keeps aspect ratio, fits landscape/portrait images and handles EXIF orientation.
            doc.image(image, 45, top, { fit: [width, 230], align: 'center', valign: 'center' })
            doc.font('Helvetica').fontSize(9).fillColor('#253744').text(photo.caption || 'Sem legenda', 45, top + 237, { width, lineGap: 2 })
            doc.fontSize(8).fillColor('#516574').text(`Etapa: ${stage} - Anexada em ${dateTime(photo.createdAt)}`, 45, doc.y + 5, { width })
            doc.y += 18
            count++
          }
        }
      }
      const range = doc.bufferedPageRange()
      for (let page = range.start; page < range.start + range.count; page++) {
        doc.switchToPage(page)
        const bottom = doc.page.margins.bottom
        doc.page.margins.bottom = 0
        doc.font('Helvetica').fontSize(8).fillColor('#516574').text(`ACC Climatização - Página ${page + 1} de ${range.count}`, 45, doc.page.height - 34, { width, align: 'right', lineBreak: false })
        doc.page.margins.bottom = bottom
      }
      doc.end()
    } catch (error) { doc.destroy(); reject(error) }
  })
}
