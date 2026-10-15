import { useEffect, useState, type ReactNode } from 'react'
import { request, type User } from '../services/api'
import { loadOperationalData } from '../services/operational-service'
import { UserContext } from './session-context'
import { OfflinePanel } from './operations/OfflinePanel'
import { checkOfflineIdentity, releaseOffline, resumeOfflineUser, setOfflineUser } from '../services/offline'
import { ApiError } from '../services/http'
import { PasswordReset } from './PasswordReset'

export function SessionGate({ children }: { children: ReactNode }) {
  const resetRoute = window.location.pathname === '/reset-password'
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!resetRoute)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (resetRoute) return
    request<User>('auth/me').then(async value => { await checkOfflineIdentity(value); setOfflineUser(value); setUser(value) }).catch(async cause => { if (cause instanceof TypeError) setUser(await resumeOfflineUser()); else if (!(cause instanceof ApiError && cause.status === 401)) setError(cause.message) }).finally(() => setLoading(false))
  }, [resetRoute])

  const load = async () => { setLoading(true); setError(''); try { await loadOperationalData(); setReady(true) } catch (err) { setError((err as Error).message) } finally { setLoading(false) } }
  useEffect(() => { if (user) { setOfflineUser(user); let cancelled = false; setLoading(true); loadOperationalData().then(() => { if (!cancelled) setReady(true) }).catch(err => { if (!cancelled) setError(err.message) }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } } }, [user])

  const login = async () => { setLoading(true); setError(''); setNotice(''); try { const signedIn = await request<User>('auth/login', 'POST', { email, password }); await checkOfflineIdentity(signedIn); setUser(signedIn); setPassword('') } catch (err) { setError((err as Error).message) } finally { setLoading(false) } }
  const requestRecovery = async () => { setLoading(true); setError(''); setNotice(''); try { const result = await request<{ message: string }>('auth/forgot-password', 'POST', { email }); setNotice(result.message) } catch (err) { setError((err as Error).message) } finally { setLoading(false) } }
  const logout = async () => { try { if (!navigator.onLine) throw new Error('Conecte-se para encerrar a sessão no servidor.'); await releaseOffline(); await request('auth/logout', 'POST'); setOfflineUser(null); setReady(false); setUser(null) } catch (err) { setError((err as Error).message) } }

  if (resetRoute) return <PasswordReset />
  if (loading) return <main className="session-panel">Carregando…</main>
  if (!user) return <main className="session-panel"><form className="resource-form" onSubmit={event => { event.preventDefault(); void (recovering ? requestRecovery() : login()) }}>
    <h1>APP-ACC</h1>
    <p>{recovering ? 'Informe seu email cadastrado para receber um link de redefinição.' : 'Entre para acessar a operação.'}</p>
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
    {!recovering && <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button className="primary-button" disabled={loading}>{recovering ? 'Enviar link' : 'Entrar'}</button>
    <button type="button" className="text-button session-link" onClick={() => { setRecovering(!recovering); setError(''); setNotice('') }}>{recovering ? 'Voltar ao login' : 'Esqueci minha senha'}</button>
  </form></main>
  if (!ready) return <main className="session-panel"><p role="alert">{error}</p><button onClick={() => void load()}>Tentar novamente</button><button onClick={() => void logout()}>Sair</button></main>
  return <UserContext.Provider value={user}><div className="session-bar"><span>{user.name} · {user.role}</span><button onClick={() => void logout()}>Sair</button><button onClick={() => { setReady(false); setUser(null); setError(''); setNotice('Entre novamente para renovar sua sessão. Seus rascunhos estão preservados.') }}>Entrar novamente</button>{error && <span role="alert">{error}</span>}</div><OfflinePanel />{children}</UserContext.Provider>
}
