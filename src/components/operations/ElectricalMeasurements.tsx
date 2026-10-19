import catalog from '../../../shared/electrical-components.json'
import type { ElectricalComponent } from '../../models/operational'

type Props = { value: ElectricalComponent[]; onChange?: (components: ElectricalComponent[]) => void }
export function ElectricalMeasurements({ value, onChange }: Props) {
  const update = (id: string, changes: Partial<ElectricalComponent>) => onChange?.(value.map(component => component.id === id ? { ...component, ...changes } : component))
  const add = () => onChange?.([...value, { id: crypto.randomUUID(), kind: 'Compressor', label: `Componente ${value.length + 1}`, supply: 'mono', readings: {}, notes: '' }])
  return <section className="electrical-measurements" aria-label="Medições elétricas por componente">
    <h3>Medições elétricas por componente</h3>
    <p>Adicione cada compressor, motor ou bomba separadamente. Campos vazios significam não medido; zero é preservado.</p>
    {value.length === 0 && <p>Nenhum componente registrado.</p>}
    {value.map(component => {
      const supply = catalog.supplies.find(item => item.id === component.supply)!
      return <fieldset className="electrical-component" key={component.id}>
        <legend>{component.kind} · {component.label}</legend>
        {onChange ? <>
          <label>Componente<select value={component.kind} onChange={event => update(component.id, { kind: event.target.value })}>{catalog.kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
          <label>Identificação<input required pattern=".*\S.*" maxLength={100} value={component.label} onChange={event => update(component.id, { label: event.target.value })} placeholder="Ex.: Compressor 1 / Motor EV-02" /></label>
          <label>Alimentação<select value={component.supply} onChange={event => {
            const next = event.target.value as ElectricalComponent['supply']
            if (Object.keys(component.readings).length && !window.confirm('Trocar a alimentação remove as medições deste componente. Continuar?')) return
            update(component.id, { supply: next, readings: {} })
          }}>{catalog.supplies.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </> : <p>{supply.label}</p>}
        <div className="checklist-measurements">{supply.fields.map(field => onChange ? <label key={field.id}>{field.label} ({field.unit})<input type="number" step="any" inputMode="decimal" min={0} max={field.max} value={component.readings[field.id] ?? ''} onChange={event => {
          const readings = { ...component.readings }
          if (event.target.value === '') delete readings[field.id]
          else readings[field.id] = Number(event.target.value)
          update(component.id, { readings })
        }} /></label> : <div key={field.id}><strong>{field.label}</strong><span>{component.readings[field.id] === undefined ? 'Não medido' : `${component.readings[field.id].toLocaleString('pt-BR')} ${field.unit}`}</span></div>)}</div>
        {onChange ? <label>Observações do componente<textarea rows={2} maxLength={1000} value={component.notes} onChange={event => update(component.id, { notes: event.target.value })} /></label> : component.notes && <p>{component.notes}</p>}
        {onChange && <button type="button" className="secondary-button" onClick={() => { if (window.confirm(`Remover ${component.label} e suas medições?`)) onChange(value.filter(item => item.id !== component.id)) }}>Remover componente</button>}
      </fieldset>
    })}
    {onChange && value.length < 20 && <button type="button" className="secondary-button" onClick={add}>Adicionar componente</button>}
    {onChange && <small>Até 20 componentes por relatório. Os valores não recebem aprovação automática; compare com os dados do fabricante.</small>}
  </section>
}
