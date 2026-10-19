import catalog from '../../../shared/maintenance-checklists.json'
import type { MaintenanceChecklist as Checklist, ChecklistStatus } from '../../models/operational'

type Props = { value?: Checklist | null; onChange?: (value: Checklist | null) => void }
export function MaintenanceChecklist({ value, onChange }: Props) {
  const model = catalog.models.find(item => item.id === value?.modelId)
  const editable = !!onChange
  const selectModel = (id: string) => {
    if (value && id !== value.modelId && !window.confirm('Trocar o modelo remove as respostas e medições deste checklist. Deseja continuar?')) return
    const next = catalog.models.find(item => item.id === id)
    onChange?.(next ? { version: 1, modelId: next.id, items: Object.fromEntries(next.items.map(item => [item.id, { status: 'Pendente', notes: '' }])), measurements: {} } : null)
  }
  const pending = model?.items.filter(item => value?.items[item.id]?.status === 'Pendente').length || 0
  const issues = model?.items.filter(item => value?.items[item.id]?.status === 'Não conforme').length || 0
  return <section className="maintenance-checklist" aria-label="Checklist de manutenção">
    <h3>Checklist de manutenção</h3>
    {editable ? <label>Tipo de equipamento<select value={value?.modelId || ''} onChange={event => selectModel(event.target.value)}><option value="">Sem checklist</option>{catalog.models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <p>{model?.name || 'Sem checklist neste relatório.'}</p>}
    {model && value && <>
      <p className="checklist-summary">{issues} não conformidade(s) · {pending} item(ns) pendente(s)</p>
      <div className="checklist-items">{model.items.map(item => {
        const entry = value.items[item.id] || { status: 'Pendente', notes: '' }
        return <div className="checklist-item" key={item.id}>
          {editable ? <>
            <label>{item.label}<select value={entry.status} onChange={event => onChange?.({ ...value, items: { ...value.items, [item.id]: { ...entry, status: event.target.value as ChecklistStatus } } })}>{catalog.statuses.map(status => <option key={status}>{status}</option>)}</select></label>
            <label>Observação — {item.label}<textarea rows={2} maxLength={1000} value={entry.notes} onChange={event => onChange?.({ ...value, items: { ...value.items, [item.id]: { ...entry, notes: event.target.value } } })} placeholder="Detalhes da inspeção (opcional)" /></label>
          </> : <><strong>{item.label}</strong><span className={entry.status === 'Não conforme' ? 'checklist-issue' : ''}>{entry.status}</span>{entry.notes && <p>{entry.notes}</p>}</>}
        </div>
      })}</div>
      <h3>Medições</h3>
      <p>Registre somente os valores medidos. Campo vazio significa não medido; zero é um valor registrado.</p>
      <div className="checklist-measurements">{model.measurements.map(field => editable ? <label key={field.id}>{field.label} ({field.unit})<input type="number" inputMode="decimal" step="any" min={field.min} max={field.max} value={value.measurements[field.id] ?? ''} onChange={event => {
        const measurements = { ...value.measurements }
        if (event.target.value === '') delete measurements[field.id]
        else measurements[field.id] = Number(event.target.value)
        onChange?.({ ...value, measurements })
      }} /></label> : <div key={field.id}><strong>{field.label}</strong><span>{value.measurements[field.id] !== undefined ? `${value.measurements[field.id].toLocaleString('pt-BR')} ${field.unit}` : 'Não medido'}</span></div>)}</div>
    </>}
  </section>
}
