import { useEffect, useState, type ReactNode } from 'react'
import { request, type User } from '../services/api'
import { loadOperationalData } from '../services/operational-service'
export function SessionGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => { request<User>('auth/me').then(setUser).catch(() => {}).finally(() => setLoading(false)) }, [])
  const load = async () => { setLoading(true); setError(''); try { await loadOperationalData(); setReady(true) } catch (err) { setError((err as Error).message) } finally { setLoading(false) } }
  useEffect(() => { if (user) { let cancelled = false; setLoading(true); loadOperationalData().then(() => { if (!cancelled) setReady(true) }).catch(err => { if (!cancelled) setError(err.message) }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } } }, [user])
  const login = async () => { setLoading(true); setError(''); try { setUser(await request<User>('auth/login', 'POST', { email, password })); setPassword('') } catch (err) { setError((err as Error).message) } finally { setLoading(false) } }
  const logout = async () => { try { await request('auth/logout', 'POST'); setReady(false); setUser(null) } catch (err) { setError((err as Error).message) } }
  if (loading) return <main className="session-panel">Carregando…</main>
  if (!user) return <main className="session-panel"><form className="resource-form" onSubmit={event => { event.preventDefault(); void login() }}><h1>APP-ACC</h1><p>Entre para acessar a operação.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="primary-button">Entrar</button></form></main>
  if (!ready) return <main className="session-panel"><p role="alert">{error}</p><button onClick={() => void load()}>Tentar novamente</button><button onClick={() => void logout()}>Sair</button></main>
  return <><div className="session-bar"><span>{user.name} · {user.role}</span><button onClick={() => void logout()}>Sair</button>{error && <span role="alert">{error}</span>}</div>{children}</>
}
