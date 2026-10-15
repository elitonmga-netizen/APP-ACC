import { useEffect, useState } from 'react'
import { prepareOfflineShell } from '../../services/offline-shell'
import { useSessionUser } from '../session-context'
import { discardDraft, draftSummary, offlineInfo, prepareOffline, syncOffline } from '../../services/offline'
type Summary = Awaited<ReturnType<typeof draftSummary>>
export function OfflinePanel() {
  const user = useSessionUser()
  const [online, setOnline] = useState(navigator.onLine)
  const [info, setInfo] = useState({ enabled: false, pending: 0, expiresAt: 0, syncing: false })
  const [drafts, setDrafts] = useState<Summary>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let cancelled = false
    let wasOnline = navigator.onLine
    const refresh = () => {
      if (!wasOnline && navigator.onLine) setError('')
      wasOnline = navigator.onLine
      setOnline(navigator.onLine)
      void Promise.all([offlineInfo(), draftSummary()]).then(([next, pending]) => { if (!cancelled) { setInfo(next); setDrafts(pending) } }).catch(() => {})
    }
    refresh()
    window.addEventListener('online', refresh); window.addEventListener('offline', refresh); window.addEventListener('acc-offline-change', refresh)
    return () => { cancelled = true; window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); window.removeEventListener('acc-offline-change', refresh) }
  }, [])
  useEffect(() => {
    if (!online || !info.pending || info.syncing || busy || error) return
    const timer = window.setTimeout(() => {
      setError('')
      void syncOffline().then(() => { setNotice('Sincronização confirmada.'); window.dispatchEvent(new Event('acc-orders-refresh')) }).catch(cause => setError((cause as Error).message))
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [online, info.pending, info.syncing, busy, error])
  if (user?.role !== 'Técnico') return null
  const prepare = async () => {
    setBusy(true); setError(''); setNotice('')
    try { await prepareOfflineShell(); await prepareOffline(user); setNotice('OS preparadas neste celular por 8 horas. Você pode trabalhar sem sinal.') }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  const sync = async () => {
    setBusy(true); setError('')
    try { await syncOffline(); setNotice('Sincronização confirmada.'); window.dispatchEvent(new Event('acc-orders-refresh')) }
    catch (cause) { setError((cause as Error).message) } finally { setBusy(false) }
  }
  return <section className="panel offline-panel" aria-label="Conexão e sincronização">
    <strong>{online ? 'Com conexão' : 'Sem sinal'} · {info.pending} OS pendente(s) de sincronização</strong>
    <p>{info.enabled ? `Preparação offline válida até ${new Date(info.expiresAt).toLocaleTimeString('pt-BR')}. Rascunhos ficam neste aparelho até sincronizar.` : 'Prepare este celular conectado para registrar relatórios, status e fotos sem sinal. Use somente em aparelho de confiança.'}</p>
    <div className="form-actions"><button className="secondary-button" disabled={!online || busy || info.syncing} onClick={() => void prepare()}>{busy ? 'Aguarde…' : info.enabled ? 'Renovar preparação offline' : 'Preparar este celular'}</button><button className="primary-button" disabled={!online || !info.pending || busy || info.syncing} onClick={() => void sync()}>{info.syncing ? 'Sincronizando…' : 'Sincronizar agora'}</button></div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error} Nenhum rascunho pendente foi apagado.</p>}
    {drafts.map(draft => <details key={draft.id}><summary>Rascunho da OS {draft.code} · {draft.photos} foto(s)</summary><p>Status: {draft.status || 'Sem alteração'}</p>{draft.report && <><p>Diagnóstico: {draft.report.diagnosis}</p><p>Serviço: {draft.report.workPerformed}</p></>}<p>Em caso de conflito, confira a versão atual com o administrador antes de descartar.</p><button className="text-button" disabled={info.syncing || busy} onClick={() => { if (window.confirm(`Descartar definitivamente o rascunho local da OS ${draft.code}, incluindo ${draft.photos} foto(s) ainda não confirmadas?`)) void discardDraft(draft.id).then(() => { setError(''); window.dispatchEvent(new Event('acc-orders-refresh')) }).catch(cause => setError((cause as Error).message)) }}>Descartar este rascunho local</button></details>)}
  </section>
}
