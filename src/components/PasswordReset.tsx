import { useState } from 'react'
import { request } from '../services/api'

export function PasswordReset() {
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setError('')
    setMessage('')
    if (!/^[a-f0-9]{64}$/.test(token)) { setError('Link inválido. Solicite uma nova redefinição.'); return }
    if (password !== confirmation) { setError('As senhas não coincidem.'); return }
    setSaving(true)
    try {
      const result = await request<{ message: string }>('auth/reset-password', 'POST', { token, password })
      setMessage(result.message)
      window.history.replaceState({}, '', '/reset-password')
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return <main className="session-panel"><form className="resource-form" onSubmit={event => { event.preventDefault(); void submit() }}>
    <h1>APP-ACC</h1>
    <p>Defina uma nova senha para sua conta.</p>
    <label>Nova senha<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} /></label>
    <label>Confirme a nova senha<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!message && <button className="primary-button" disabled={saving}>{saving ? 'Salvando…' : 'Redefinir senha'}</button>}
    {message && <a className="text-button session-link" href="/">Ir para o login</a>}
  </form></main>
}
