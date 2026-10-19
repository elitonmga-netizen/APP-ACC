import checklistCatalog from '../../../shared/maintenance-checklists.json'
import { MaintenanceChecklist } from './MaintenanceChecklist'
import { useState, type FormEvent } from 'react'
import type { ServiceOrder, TechnicalReportInput } from '../../models/operational'
import { operationalService } from '../../services/operational-service'
import { OrderPhotos } from './OrderPhotos'
import { DetailModal } from '../ui/DetailModal'
import { ReportPdfButton } from './ReportPdfButton'

type Props = { order: ServiceOrder; editable: boolean; onClose: () => void; onSave: (report: TechnicalReportInput) => Promise<void> }

export function TechnicalReportModal({ order, editable, onClose, onSave }: Props) {
  const existing = order.technicalReport
  const [values, setValues] = useState<TechnicalReportInput>({
    diagnosis: existing?.diagnosis ?? '', workPerformed: existing?.workPerformed ?? '',
    materialsUsed: existing?.materialsUsed ?? '', recommendations: existing?.recommendations ?? '', checklist: existing ? existing.checklist ?? null : (() => { const model = checklistCatalog.models.find(item => item.id === order.checklistModelId); return model ? { version: 1 as const, modelId: model.id, items: Object.fromEntries(model.items.map(item => [item.id, { status: 'Pendente' as const, notes: '' }])), measurements: {} } : null })(),
  })
  const [preparingPhotos, setPreparingPhotos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const client = operationalService.clients.findById(order.clientId)?.name ?? 'Cliente'
  const location = operationalService.locations.findById(order.locationId)?.name ?? 'Unidade'
  const equipment = operationalService.equipment.findById(order.equipmentId)?.name ?? 'Equipamento'
  const update = (field: 'diagnosis' | 'workPerformed' | 'materialsUsed' | 'recommendations', value: string) => setValues(current => ({ ...current, [field]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (preparingPhotos || saving) return
    setSaving(true); setError('')
    try { await onSave(values) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o relatório.') } finally { setSaving(false) }
  }
  return <DetailModal title={`Relatório técnico · ${order.code}`} onClose={onClose}>
    <div className="technical-report-context"><b>{client}</b><span>{location} · {equipment}</span><span>Agendamento: {order.scheduledFor}</span></div>
    {editable ? <form className="resource-form technical-report-form" onSubmit={submit}>
      <fieldset disabled={saving} className="technical-report-fields">
      <label>Diagnóstico<textarea required maxLength={5000} rows={3} value={values.diagnosis} onChange={event => update('diagnosis', event.target.value)} placeholder="Descreva o problema encontrado" /></label>
      <label>Serviço executado<textarea required maxLength={5000} rows={4} value={values.workPerformed} onChange={event => update('workPerformed', event.target.value)} placeholder="Descreva o que foi realizado" /></label>
      <label>Materiais utilizados<textarea maxLength={5000} rows={2} value={values.materialsUsed} onChange={event => update('materialsUsed', event.target.value)} placeholder="Peças e materiais (opcional)" /></label>
      <label>Recomendações<textarea maxLength={5000} rows={3} value={values.recommendations} onChange={event => update('recommendations', event.target.value)} placeholder="Próximas ações recomendadas (opcional)" /></label>
      <MaintenanceChecklist value={values.checklist} onPreparingChange={setPreparingPhotos} onChange={checklist => setValues(current => ({ ...current, checklist }))} />
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button disabled={saving || preparingPhotos} className="primary-button">{preparingPhotos ? 'Preparando fotos…' : saving ? 'Salvando…' : existing ? 'Salvar alterações' : 'Salvar relatório'}</button></div>
    </form> : existing ? <div className="technical-report-readonly">
      <div><span>Diagnóstico</span><p>{existing.diagnosis}</p></div>
      <div><span>Serviço executado</span><p>{existing.workPerformed}</p></div>
      <div><span>Materiais utilizados</span><p>{existing.materialsUsed || 'Não informado'}</p></div>
      <div><span>Recomendações</span><p>{existing.recommendations || 'Não informado'}</p></div>
      <MaintenanceChecklist value={existing.checklist} />
      <small>{existing.updatedAt === new Date(0).toISOString() ? 'Rascunho local · pendente de sincronização' : `Atualizado em ${new Date(existing.updatedAt).toLocaleString('pt-BR')}`}</small>
      <div className="form-actions"><ReportPdfButton order={order} /><button type="button" className="secondary-button" onClick={onClose}>Fechar</button></div>
    </div> : <div className="technical-report-readonly"><p>O técnico ainda não preencheu o relatório desta ordem.</p><div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Fechar</button></div></div>}
    <OrderPhotos orderId={order.id} technicianId={order.technicianId} />
  </DetailModal>
}
