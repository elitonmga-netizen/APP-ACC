import { preparePhoto } from '../../services/photo'
import { useEffect, useState, type ChangeEvent } from 'react'
import { apiEnabled, request } from '../../services/api'
import { useSessionUser } from '../session-context'

type Photo = { id: string; stage: 'Antes' | 'Depois'; caption: string; data: string; createdAt: string }


export function OrderPhotos({ orderId, technicianId }: { orderId: string; technicianId: string }) {
  const user = useSessionUser()
  const canUpload = ['Administrador', 'Gestor'].includes(user?.role ?? '') || (user?.role === 'Técnico' && user.technicianId === technicianId)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [stage, setStage] = useState<Photo['stage']>('Antes')
  const [caption, setCaption] = useState('')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!apiEnabled) return
    let cancelled = false
    setLoaded(false); setError('')
    request<Photo[]>(`service-orders/${encodeURIComponent(orderId)}/photos`).then(items => {
      if (!cancelled) { setPhotos(items); setLoaded(true) }
    }).catch(cause => { if (!cancelled) setError((cause as Error).message) })
    return () => { cancelled = true }
  }, [orderId, revision])
  if (!apiEnabled) return null
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setError(''); setNotice(''); setPreview('')
    try { setPreview(await preparePhoto(file)) }
    catch (cause) { setError((cause as Error).message || 'Não foi possível abrir a imagem. Tente JPEG ou PNG.') }
    finally { setBusy(false) }
  }
  const upload = async () => {
    if (!preview || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await request<Photo>(`service-orders/${encodeURIComponent(orderId)}/photos`, 'POST', { stage, caption, data: preview })
      setPhotos(items => [...items, saved]); setPreview(''); setCaption(''); setNotice('Foto salva. Confira as pendências de sincronização.')
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="order-photos" aria-label="Fotos do atendimento">
    <h3>Fotos do atendimento</h3>
    <p>Antes e depois do serviço · {photos.length}/12 fotos</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!loaded && !error && <p role="status">Carregando fotos…</p>}
    {error && !loaded && <button type="button" className="secondary-button" onClick={() => setRevision(value => value + 1)}>Tentar carregar fotos</button>}
    {canUpload && loaded && photos.length < 12 && <div className="resource-form">
      <label>Etapa da foto<select value={stage} disabled={busy} onChange={event => setStage(event.target.value as Photo['stage'])}><option>Antes</option><option>Depois</option></select></label>
      <label>Legenda da foto<input value={caption} maxLength={300} disabled={busy} onChange={event => setCaption(event.target.value)} placeholder="Ex.: serpentina antes da limpeza" /></label>
      <label>Tirar foto<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={event => void choose(event)} /></label>
      <label>Selecionar da galeria<input type="file" accept="image/*" disabled={busy} onChange={event => void choose(event)} /></label>
      {preview && <figure><img className="order-photo" src={preview} alt="Prévia da foto selecionada" /><figcaption>Prévia · {stage}. Toque em Salvar foto para anexar.</figcaption></figure>}
      <div className="form-actions">{preview && <button type="button" className="secondary-button" disabled={busy} onClick={() => setPreview('')}>Descartar seleção</button>}<button type="button" className="primary-button" disabled={busy || !preview} onClick={() => void upload()}>{busy ? 'Preparando ou enviando…' : 'Salvar foto'}</button></div>
      <small>Sem sinal, prepare este celular antes. Imagens são reduzidas para até 600 KB antes do envio. As fotos são salvas separadamente do texto do relatório.</small>
    </div>}
    {loaded && !photos.length && <p>Nenhuma foto anexada.</p>}
    <div className="order-photo-grid">{photos.map(photo => <figure key={photo.id}><img className="order-photo" loading="lazy" src={photo.data} alt={`${photo.stage}: ${photo.caption || 'Registro do atendimento'}`} /><figcaption><strong>{photo.stage}</strong><p>{photo.caption || 'Sem legenda'}</p><small>{photo.createdAt === new Date(0).toISOString() ? 'Pendente de sincronização' : new Date(photo.createdAt).toLocaleString('pt-BR')}</small></figcaption></figure>)}</div>
  </section>
}
