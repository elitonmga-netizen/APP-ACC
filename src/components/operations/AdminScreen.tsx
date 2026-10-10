import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { request, type User } from '../../services/api'
import { operationalService } from '../../services/operational-service'

type AuditPage = { items: { id: string; user_name: string; action: string; resource: string; resource_id: string; before_data: string | null; after_data: string | null; created_at: string }[]; total: number; page: number; limit: number }
export function AdminScreen({ view }: { view: 'Usuários' | 'Auditoria' }) {
  const [users, setUsers] = useState<User[]>([])
  const [audit, setAudit] = useState<AuditPage | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Operador', technicianId: '' })
  const [resetFor, setResetFor] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const refresh = useCallback(async () => {
    setError('')
    try { if (view === 'Usuários') setUsers(await request<User[]>('users')); else setAudit(await request<AuditPage>(`audit?page=${page}&limit=20`)) }
    catch (err) { setError((err as Error).message) }
  }, [view, page])
  useEffect(() => { void refresh() }, [refresh])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { await request<User>('users', 'POST', { ...form, technicianId: form.role === 'Técnico' ? form.technicianId : undefined }); setForm({ name: '', email: '', password: '', role: 'Operador', technicianId: '' }); await refresh() }
    catch (err) { setError((err as Error).message) } finally { setSaving(false) }
  }
  const toggle = async (user: User) => {
    setError(''); try { await request(`users/${user.id}`, 'PATCH', { active: !user.active }); await refresh() } catch (err) { setError((err as Error).message) }
  }
  const reset = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try { await request(`users/${resetFor}/password`, 'POST', { password: newPassword }); setResetFor(''); setNewPassword(''); setError('Senha atualizada; sessões anteriores encerradas.') } catch (err) { setError((err as Error).message) } finally { setSaving(false) }
  }
  if (view === 'Auditoria') return <section className="panel admin-panel"><div className="panel__header"><div><h2>Histórico de alterações</h2><p>Registros de criação, edição e exclusão.</p></div></div>{error && <p role="alert">{error}</p>}<div className="audit-list">{audit?.items.map(item => <article key={item.id}><b>{item.user_name}</b><span>{item.action === 'create' ? 'criou' : item.action === 'update' ? 'editou' : 'excluiu'} {item.resource} · {item.resource_id}</span><time>{new Date(item.created_at).toLocaleString('pt-BR')}</time></article>)}</div><div className="form-actions"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} · {audit?.total ?? 0} eventos</span><button disabled={!audit || page * audit.limit >= audit.total} onClick={() => setPage(page + 1)}>Próxima</button></div></section>
  return <section className="admin-grid"><article className="panel admin-panel"><div className="panel__header"><div><h2>Usuários</h2><p>Contas e permissões da equipe.</p></div></div>{error && <p role="alert">{error}</p>}<div className="user-list">{users.map(user => <article key={user.id}><div><b>{user.name}</b><span>{user.email} · {user.role} · {user.active ? 'Ativo' : 'Inativo'}</span></div><div className="form-actions"><button onClick={() => void toggle(user)}>{user.active ? 'Desativar' : 'Ativar'}</button><button onClick={() => setResetFor(user.id)}>Redefinir senha</button></div></article>)}</div>{resetFor && <form className="resource-form" onSubmit={reset}><h3>Redefinir senha</h3><label>Nova senha<input type="password" required minLength={12} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><div className="form-actions"><button type="button" onClick={() => setResetFor('')}>Cancelar</button><button disabled={saving} className="primary-button">Salvar senha</button></div></form>}</article><article className="panel admin-panel"><div className="panel__header"><div><h2>Novo usuário</h2><p>Senhas precisam ter pelo menos 12 caracteres.</p></div></div><form className="resource-form" onSubmit={submit}><label>Nome<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>Email<input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Perfil<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value, technicianId: '' })}>{['Administrador', 'Gestor', 'Técnico', 'Operador'].map(role => <option key={role}>{role}</option>)}</select></label>{form.role === 'Técnico' && <label>Ficha do técnico<select required value={form.technicianId} onChange={event => setForm({ ...form, technicianId: event.target.value })}><option value="">Selecione…</option>{operationalService.technicians.list().map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></label>}<label>Senha inicial<input type="password" required minLength={12} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><button disabled={saving} className="primary-button">Criar usuário</button></form></article></section>
}
