import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { ChecklistPhoto } from '../../models/operational'
import { preparePhoto } from '../../services/photo'

type Props = { label: string; photos: ChecklistPhoto[]; total: number; blocked?: boolean; onChange?: (photos: ChecklistPhoto[]) => void; onPreparing?: (busy: boolean) => void }
export function ChecklistItemPhotos({ label, photos, total, blocked, onChange, onPreparing }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef({ photos, total, onChange, onPreparing })
  latest.current = { photos, total, onChange, onPreparing }
  useEffect(() => () => { latest.current.onPreparing?.(false) }, [])
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy || blocked) return
    setBusy(true); setError(''); latest.current.onPreparing?.(true)
    try {
      const data = await preparePhoto(file, 307200)
      const current = latest.current
      if (current.photos.length >= 2 || current.total >= 24) throw new Error('Limite: 2 fotos por item e 24 fotos no checklist.')
      current.onChange?.([...current.photos, { id: crypto.randomUUID(), data, caption: '' }])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a foto.') }
    finally { setBusy(false); latest.current.onPreparing?.(false) }
  }
  return <div className="checklist-item-photos" aria-label={`Fotos de ${label}`}>
    <strong>Fotos do item · {photos.length}/2</strong>
    {onChange && photos.length < 2 && total < 24 && <div className="checklist-photo-controls">
      <label>Tirar foto — {label}<input type="file" accept="image/*" capture="environment" disabled={busy || blocked} onChange={event => void choose(event)} /></label>
      <label>Galeria — {label}<input type="file" accept="image/*" disabled={busy || blocked} onChange={event => void choose(event)} /></label>
    </div>}
    {busy && <p role="status">Preparando foto…</p>}{error && <p role="alert">{error}</p>}
    <div className="order-photo-grid">{photos.map(photo => <figure key={photo.id}>
      <img className="order-photo" loading="lazy" src={photo.data} alt={`${label}: ${photo.caption || 'Foto da inspeção'}`} />
      {onChange ? <><label>Legenda — {label}<input maxLength={300} value={photo.caption} onChange={event => onChange(photos.map(item => item.id === photo.id ? { ...item, caption: event.target.value } : item))} /></label><button type="button" className="secondary-button" disabled={busy || blocked} onClick={() => onChange(photos.filter(item => item.id !== photo.id))}>Remover foto do item</button></> : <figcaption>{photo.caption || 'Sem legenda'}</figcaption>}
    </figure>)}</div>
    {onChange && <small>Fotos reduzidas para até 300 KB. Use Salvar relatório para gravar as fotos, legendas e remoções deste item.</small>}
  </div>
}
