import units from '../../../shared/pressure-units.json'
import type { RefrigerantCircuit } from '../../models/operational'
type Props = { value: RefrigerantCircuit[]; onChange?: (value: RefrigerantCircuit[]) => void }
export function RefrigerantPressures({ value, onChange }: Props) {
  const update = (id: string, changes: Partial<RefrigerantCircuit>) => onChange?.(value.map(circuit => circuit.id === id ? { ...circuit, ...changes } : circuit))
  return <section className="electrical-measurements" aria-label="Pressões do circuito frigorífico">
    <h3>Pressão de alta e baixa</h3>
    <p>Adicione cada circuito separadamente. Pressões manométricas; selecione a unidade do instrumento. Campo vazio significa não medido.</p>
    {!value.length && <p>Nenhum circuito registrado.</p>}
    {value.map(circuit => {
      const unit = units.find(item => item.id === circuit.unit)!
      return <fieldset className="electrical-component" key={circuit.id}>
        <legend>{circuit.label}</legend>
        {onChange && <>
          <label>Identificação do circuito<input required pattern=".*\S.*" maxLength={100} value={circuit.label} onChange={event => update(circuit.id, { label: event.target.value })} placeholder="Ex.: Circuito 1 / VRF A" /></label>
          <label>Unidade das pressões<select value={circuit.unit} onChange={event => {
            if ((circuit.high !== undefined || circuit.low !== undefined) && !window.confirm('Trocar a unidade limpa as pressões deste circuito. Registre novamente os valores na nova unidade. Continuar?')) return
            update(circuit.id, { unit: event.target.value as RefrigerantCircuit['unit'], high: undefined, low: undefined })
          }}>{units.map(item => <option key={item.id}>{item.id}</option>)}</select></label>
        </>}
        <div className="checklist-measurements">{(['high', 'low'] as const).map(key => onChange ? <label key={key}>Pressão de {key === 'high' ? 'alta' : 'baixa'} ({circuit.unit})<input type="number" inputMode="decimal" step="any" min={unit.min} max={unit.max} value={circuit[key] ?? ''} onChange={event => update(circuit.id, { [key]: event.target.value === '' ? undefined : Number(event.target.value) })} /></label> : <div key={key}><strong>Pressão de {key === 'high' ? 'alta' : 'baixa'}</strong><span>{circuit[key] === undefined ? 'Não medido' : `${circuit[key].toLocaleString('pt-BR', { maximumFractionDigits: 6 })} ${circuit.unit}`}</span></div>)}</div>
        {onChange ? <label>Observações do circuito<textarea maxLength={1000} rows={2} value={circuit.notes} onChange={event => update(circuit.id, { notes: event.target.value })} /></label> : circuit.notes && <p>{circuit.notes}</p>}
        {onChange && <button type="button" className="secondary-button" onClick={() => { if (window.confirm(`Remover ${circuit.label} e suas pressões?`)) onChange(value.filter(item => item.id !== circuit.id)) }}>Remover circuito</button>}
      </fieldset>
    })}
    {onChange && value.length < 20 && <button className="secondary-button" type="button" onClick={() => onChange([...value, { id: crypto.randomUUID(), label: `Circuito ${value.length + 1}`, unit: 'bar', notes: '' }])}>Adicionar circuito frigorífico</button>}
    {onChange && <small>Até 20 circuitos. Salve o relatório para gravar as medições. A troca de unidade não converte valores automaticamente.</small>}
  </section>
}
