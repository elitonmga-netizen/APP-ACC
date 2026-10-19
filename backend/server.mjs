import { captureNonconformities, configureAction, correctiveSummary, generateCorrectiveOrder, manager, reviewAction } from './corrective-actions.mjs'
import { generatePreventiveOrder, localDay, planningFields } from './maintenance-planning.mjs'
import { syncOfflineOrder } from './offline-sync.mjs'
import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { extname, resolve, sep } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { openDatabase } from './database.mjs'
import { createUser, digest, hashPassword, publicUser, verifyPassword } from './auth.mjs'
import { HttpError, schemas } from './schema.mjs'
import { generateReportPdf, reportFilename } from './report-pdf.mjs'
function technicianScope(store, technicianId) {
  const orders = store.list('service-orders').filter(item => item.technicianId === technicianId)
  const maintenance = store.list('maintenance').filter(item => item.technicianId === technicianId)
  const corrective = store.list('corrective-actions').filter(item => item.technicianId === technicianId)
  const equipmentIds = new Set([...orders.map(item => item.equipmentId), ...maintenance.map(item => item.equipmentId), ...corrective.map(item => item.equipmentId)])
  const equipment = store.list('equipment').filter(item => equipmentIds.has(item.id))
  const clientIds = new Set([...orders.map(item => item.clientId), ...equipment.map(item => item.clientId)])
  const locationIds = new Set([...orders.map(item => item.locationId), ...equipment.map(item => item.locationId)])
  return {
    'service-orders': orders, maintenance, equipment,
    locations: store.list('locations').filter(item => locationIds.has(item.id)),
    clients: store.list('clients').filter(item => clientIds.has(item.id)),
    technicians: store.list('technicians').filter(item => item.id === technicianId),
    'climate-systems': store.list('climate-systems').filter(item => equipment.some(entry => entry.systemId === item.id)),
  }
}
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }
async function serveStatic(req, res, directory) {
  if (!['GET', 'HEAD'].includes(req.method)) return false
  let pathname
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { return false }
  const root = resolve(directory)
  let file = resolve(root, `.${pathname}`)
  if (file !== root && !file.startsWith(`${root}${sep}`)) return false
  try { if (!(await stat(file)).isFile()) file = resolve(root, 'index.html') }
  catch {
    if (extname(pathname)) return false
    file = resolve(root, 'index.html')
  }
  try {
    const details = await stat(file)
    if (!details.isFile()) return false
    const content = await readFile(file)
    const immutable = /[/\\]assets[/\\]/.test(file) && /-[\w-]{8,}\.(js|css)$/.test(file)
    res.writeHead(200, { 'Content-Type': extname(file) === '.webmanifest' ? 'application/manifest+json; charset=utf-8' : contentTypes[extname(file)] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
    res.end(req.method === 'HEAD' ? undefined : content)
    return true
  } catch { return false }
}
async function sendPasswordResetEmail({ email, name, token, apiKey, from, appUrl }) {
  const link = new URL(`/reset-password?token=${encodeURIComponent(token)}`, appUrl).toString()
  const safeName = escapeHtml(name)
  const safeLink = escapeHtml(link)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'Redefina sua senha do APP-ACC', html: `<p>Olá, ${safeName}.</p><p>Recebemos uma solicitação para redefinir sua senha do APP-ACC. O link expira em 30 minutos e só pode ser usado uma vez.</p><p><a href="${safeLink}">Criar nova senha</a></p><p>Se você não pediu essa alteração, ignore este email.</p>`, text: `Olá, ${name}. Acesse ${link} para redefinir sua senha do APP-ACC. O link expira em 30 minutos e só pode ser usado uma vez. Se você não pediu essa alteração, ignore este email.` }),
  })
  if (!response.ok) throw new Error(`Resend respondeu HTTP ${response.status}`)
}
async function body(req, limit = 32768) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use application/json.')
  let text = ''
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > limit) throw new HttpError(413, 'Corpo muito grande.') }
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value }
  catch { throw new HttpError(400, 'JSON inválido.') }
}
export async function createApp({ databasePath = process.env.DATABASE_PATH || 'backend/data/acc.sqlite', origin = process.env.CORS_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173', secure = process.env.NODE_ENV === 'production', staticDirectory = resolve('dist') } = {}) {
  const store = openDatabase(databasePath)
  const { db } = store
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'))
  const attempts = new Map()
  const recoveryAttempts = new Map()
  const resendKey = process.env.RESEND_API_KEY || ''
  const emailFrom = process.env.EMAIL_FROM || ''
  const appUrl = process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173'
  let validAppUrl = false
  try { const parsed = new URL(appUrl); validAppUrl = ['http:', 'https:'].includes(parsed.protocol) && (process.env.NODE_ENV !== 'production' || parsed.protocol === 'https:') } catch { validAppUrl = false }
  const cookie = (token, age) => `acc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`
  const server = createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status); res.end(data === undefined ? undefined : JSON.stringify(data)) }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (!new URL(req.url, 'http://localhost').pathname.startsWith('/api/')) {
        if (await serveStatic(req, res, staticDirectory)) return
        throw new HttpError(404, 'Página inexistente.')
      }
      if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'Origem não permitida.')
      if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin') }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ACC-Request'); return send(204) }
      const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean)
      if (parts[0] !== 'api' || parts.length > 4) throw new HttpError(404, 'Rota inexistente.')
      const [, resource, rawId, action] = parts
      const id = rawId && decodeURIComponent(rawId)
      if (req.method === 'GET' && resource === 'health') return send(200, { status: 'ok' })
      if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-acc-request'] !== '1') throw new HttpError(403, 'Cabeçalho de proteção obrigatório.')
      if (resource === 'auth' && id === 'login' && req.method === 'POST') {
        const key = req.socket.remoteAddress
        const now = Date.now()
        for (const [address, value] of attempts) if (value.until <= now) attempts.delete(address)
        const attempt = attempts.get(key) || { count: 0, until: now + 900000 }
        if (attempt.count >= 10) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.')
        attempt.count++; attempts.set(key, attempt)
        const input = await body(req)
        if (typeof input.email !== 'string' || typeof input.password !== 'string' || input.password.length > 256) throw new HttpError(400, 'Credenciais inválidas.')
        const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(input.email.trim().toLowerCase())
        const valid = await verifyPassword(input.password, user?.password_hash || dummyHash)
        if (!user || !valid) throw new HttpError(401, 'Email ou senha inválidos.')
        attempts.delete(key)
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now)
        const token = randomBytes(32).toString('hex')
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), user.id, now + 28800000)
        res.setHeader('Set-Cookie', cookie(token, 28800)); return send(200, publicUser(user))
      }
      if (resource === 'auth' && id === 'forgot-password' && req.method === 'POST') {
        if (!resendKey || !emailFrom || !validAppUrl) throw new HttpError(503, 'A recuperação de senha não está configurada neste ambiente.')
        const key = req.socket.remoteAddress || 'unknown'
        const now = Date.now()
        const prior = recoveryAttempts.get(key)
        if (prior && prior.until > now && prior.count >= 5) throw new HttpError(429, 'Muitas solicitações. Tente novamente mais tarde.')
        const limit = prior && prior.until > now ? prior : { count: 0, until: now + 900000 }
        limit.count++; recoveryAttempts.set(key, limit)
        for (const [address, value] of recoveryAttempts) if (value.until <= now) recoveryAttempts.delete(address)
        const input = await body(req)
        if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new HttpError(400, 'Informe um email válido.')
        const generic = { message: 'Se o email estiver cadastrado, enviaremos um link para redefinir a senha.' }
        const target = db.prepare('SELECT id,email,name FROM users WHERE email=? AND active=1').get(input.email.trim().toLowerCase())
        if (target) {
          const token = randomBytes(32).toString('hex')
          db.exec('BEGIN')
          try {
            db.prepare('DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at<=?').run(target.id, now)
            db.prepare('INSERT INTO password_reset_tokens VALUES(?,?,?)').run(digest(token), target.id, now + 1800000)
            db.exec('COMMIT')
          } catch (error) { db.exec('ROLLBACK'); throw error }
          void sendPasswordResetEmail({ email: target.email, name: target.name, token, apiKey: resendKey, from: emailFrom, appUrl }).catch(error => console.error('Password recovery email failed:', error.message))
        }
        return send(200, generic)
      }
      if (resource === 'auth' && id === 'reset-password' && req.method === 'POST') {
        const input = await body(req)
        if (Object.keys(input).some(key => !['token', 'password'].includes(key)) || typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token) || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) throw new HttpError(400, 'O link ou a nova senha é inválido. Use uma senha entre 12 e 256 caracteres.')
        const passwordHash = await hashPassword(input.password)
        db.exec('BEGIN')
        try {
          const reset = db.prepare('SELECT password_reset_tokens.user_id FROM password_reset_tokens JOIN users ON users.id=password_reset_tokens.user_id WHERE token_hash=? AND expires_at>? AND users.active=1').get(digest(input.token), Date.now())
          if (!reset) { db.exec('ROLLBACK'); throw new HttpError(400, 'Este link expirou ou já foi usado. Solicite outro.') }
          db.prepare('UPDATE users SET password_hash=? WHERE id=? AND active=1').run(passwordHash, reset.user_id)
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(reset.user_id)
          db.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').run(reset.user_id)
          db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,after_data) VALUES(?,?,?,?,?,?)').run(randomUUID(), reset.user_id, 'self_service_password_reset', 'users', reset.user_id, JSON.stringify({ credentialChanged: true }))
          db.exec('COMMIT')
        } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error }
        return send(200, { message: 'Senha redefinida. Entre com a nova senha.' })
      }
      const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('acc_session='))?.slice(12)
      const user = token && db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(digest(token), Date.now())
      if (!user || !user.active) throw new HttpError(401, 'Faça login para continuar.')
      if (resource === 'auth' && id === 'me' && req.method === 'GET') return send(200, publicUser(user))
      if (resource === 'auth' && id === 'logout' && req.method === 'POST') { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); res.setHeader('Set-Cookie', cookie('', 0)); return send(204) }
      if (resource === 'users') {
        if (user.role !== 'Administrador') throw new HttpError(403, 'Apenas administrador.')
        if (req.method === 'GET' && !id) return send(200, db.prepare('SELECT id,email,name,role,active,technician_id FROM users ORDER BY name').all().map(publicUser))
        if (req.method === 'POST' && !id) return send(201, publicUser(await createUser(db, await body(req), user.id)))
        if (id && action === 'password' && req.method === 'POST') {
          const target = db.prepare('SELECT * FROM users WHERE id=?').get(id)
          if (!target) throw new HttpError(404, 'Usuário inexistente.')
          const input = await body(req)
          if (Object.keys(input).length !== 1 || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) throw new HttpError(400, 'A senha deve ter entre 12 e 256 caracteres.')
          db.exec('BEGIN')
          try {
            db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await hashPassword(input.password), id)
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)
            db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,before_data,after_data) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), user.id, 'password_reset', 'users', id, null, JSON.stringify({ credentialChanged: true }))
            db.exec('COMMIT')
          } catch (error) { db.exec('ROLLBACK'); throw error }
          return send(204)
        }
        if (id && req.method === 'PATCH') {
          const target = db.prepare('SELECT * FROM users WHERE id=?').get(id)
          if (!target) throw new HttpError(404, 'Usuário inexistente.')
          const input = await body(req)
          if (Object.keys(input).some(key => !['name', 'role', 'active', 'technicianId'].includes(key)) || (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200)) || (input.role !== undefined && !['Administrador', 'Gestor', 'Técnico', 'Operador'].includes(input.role)) || (input.active !== undefined && typeof input.active !== 'boolean') || (input.technicianId !== undefined && typeof input.technicianId !== 'string')) throw new HttpError(400, 'Dados de usuário inválidos.')
          const next = { ...publicUser(target), ...input }
          if (next.role === 'Técnico' && !next.technicianId) throw new HttpError(400, 'Vincule uma ficha de técnico.')
          if (next.technicianId && !db.prepare("SELECT 1 FROM records WHERE resource='technicians' AND id=?").get(next.technicianId)) throw new HttpError(400, 'Ficha de técnico inexistente.')
          if (target.id === user.id && !next.active) throw new HttpError(400, 'Não é possível desativar a própria conta.')
          if (target.role === 'Administrador' && (next.role !== 'Administrador' || !next.active) && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='Administrador' AND active=1").get().count <= 1) throw new HttpError(409, 'Mantenha pelo menos um administrador ativo.')
          db.exec('BEGIN')
          try {
            db.prepare('UPDATE users SET name=?,role=?,active=?,technician_id=? WHERE id=?').run(next.name, next.role, Number(next.active), next.technicianId, id)
            db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,before_data,after_data) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), user.id, 'update', 'users', id, JSON.stringify(publicUser(target)), JSON.stringify(next))
            if (!next.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id)
            db.exec('COMMIT')
          } catch (error) { db.exec('ROLLBACK'); throw error }
          return send(200, next)
        }
        throw new HttpError(405, 'Método não permitido.')
      }
      if (resource === 'audit' && req.method === 'GET' && !id) {
        if (user.role !== 'Administrador') throw new HttpError(403, 'Apenas administrador.')
        const params = new URL(req.url, 'http://localhost').searchParams
        const page = Number(params.get('page') || 1), limit = Number(params.get('limit') || 20)
        if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Parâmetros de paginação inválidos.')
        return send(200, { items: db.prepare('SELECT audit_log.*, users.name AS user_name FROM audit_log JOIN users ON users.id=audit_log.user_id ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, (page - 1) * limit), page, limit, total: db.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count })
      }
      if (resource === 'service-orders' && id && action === 'report.pdf') {
        if (!['Administrador', 'Gestor'].includes(user.role)) throw new HttpError(403, 'Apenas administrador ou gestor pode baixar o PDF.')
        if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.')
        const order = store.get('service-orders', id)
        if (!order) throw new HttpError(404, 'Ordem inexistente.')
        if (!order.technicalReport) throw new HttpError(409, 'O técnico ainda não preencheu o relatório desta ordem.')
        const equipment = store.get('equipment', order.equipmentId)
        const photos = db.prepare('SELECT stage,caption,data,created_at AS createdAt FROM order_photos WHERE order_id=? ORDER BY created_at,id').all(id)
        let pdf
        try {
          pdf = await generateReportPdf({ order, client: store.get('clients', order.clientId), location: store.get('locations', order.locationId), equipment, system: equipment && store.get('climate-systems', equipment.systemId), technician: store.get('technicians', order.technicalReport.technicianId), photos })
        } catch (error) {
          console.error('PDF generation failed:', error.message)
          throw new HttpError(422, 'Não foi possível gerar o PDF. Verifique se as fotos anexadas são imagens JPEG válidas.')
        }
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${reportFilename(order.code)}"`, 'Content-Length': pdf.length })
        return res.end(pdf)
      }
      if (resource === 'corrective-actions') {
        const scoped = () => store.list(resource).filter(item => user.role !== 'Técnico' || item.technicianId === user.technician_id)
        if (req.method === 'GET' && !id) {
          const params = new URL(req.url, 'http://localhost').searchParams
          const all = scoped(), summary = correctiveSummary(all)
          if (params.get('summary') === '1') return send(200, summary)
          const page = Number(params.get('page') || 1), limit = 20
          if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400, 'Página inválida.')
          const q = (params.get('q') || '').toLocaleLowerCase(), filter = params.get('status'), equipmentId = params.get('equipmentId')
          const matches = all.filter(item => (!equipmentId || item.equipmentId === equipmentId) && (!filter || item.status === filter) && (params.get('overdue') !== '1' || item.status !== 'Resolvida' && item.dueDate && item.dueDate < localDay()) && `${item.code} ${item.sourceLabel} ${item.sourceOrderCode} ${store.get('equipment', item.equipmentId)?.name || ''} ${store.get('equipment', item.equipmentId)?.tag || ''}`.toLocaleLowerCase().includes(q)).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.createdAt.localeCompare(a.createdAt))
          return send(200, { items: matches.slice((page - 1) * limit, page * limit).map(item => ({ ...item, equipmentLabel: `${store.get('equipment', item.equipmentId)?.tag || ''} · ${store.get('equipment', item.equipmentId)?.name || 'Equipamento'}`, evidencePhotoCount: item.evidence.photos.length, evidence: { ...item.evidence, photos: [] } })), total: matches.length, page, limit, summary })
        }
        if (id === 'import' && req.method === 'POST' && !action) {
          manager(user)
          if (Object.keys(await body(req)).length) throw new HttpError(400, 'Importação não aceita campos adicionais.')
          db.exec('BEGIN IMMEDIATE')
          try { let created = 0; for (const order of store.list('service-orders')) created += captureNonconformities(store, order, user.id); db.exec('COMMIT'); return send(200, { created }) }
          catch (error) { db.exec('ROLLBACK'); throw error }
        }
        const item = id && store.get(resource, id)
        if (!item || user.role === 'Técnico' && item.technicianId !== user.technician_id) throw new HttpError(404, 'Pendência inexistente.')
        if (req.method === 'GET' && !action) return send(200, item)
        if (req.method === 'PATCH' && !action) return send(200, configureAction(store, user, id, await body(req)))
        if (req.method === 'POST' && action === 'generate-order') {
          if (Object.keys(await body(req)).length) throw new HttpError(400, 'Geração não aceita campos adicionais.')
          const result = generateCorrectiveOrder(store, user, id); return send(result.created ? 201 : 200, result)
        }
        if (req.method === 'POST' && action === 'review') return send(200, reviewAction(store, user, id, await body(req)))
        throw new HttpError(405, 'Método não permitido.')
      }
      if (resource === 'maintenance' && id && action === 'generate-order') {
        if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.')
        if (Object.keys(await body(req)).length) throw new HttpError(400, 'Geração de OS não aceita campos adicionais.')
        const result = generatePreventiveOrder(store, user, id)
        return send(result.created ? 201 : 200, result)
      }
      if (resource === 'equipment' && id && action === 'history') {
        if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.')
        const equipment = store.get('equipment', id)
        if (!equipment || user.role === 'Técnico' && !technicianScope(store, user.technician_id).equipment.some(item => item.id === id)) throw new HttpError(404, 'Equipamento inexistente.')
        const orders = store.list('service-orders').filter(order => order.equipmentId === id && (user.role !== 'Técnico' || order.technicianId === user.technician_id)).sort((a, b) => (b.completedAt || b.technicalReport?.updatedAt || b.scheduledFor).localeCompare(a.completedAt || a.technicalReport?.updatedAt || a.scheduledFor))
        const maintenance = store.list('maintenance').filter(item => item.equipmentId === id && (user.role !== 'Técnico' || item.technicianId === user.technician_id))
        const page = Number(new URL(req.url, 'http://localhost').searchParams.get('page') || 1), limit = 20
        if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400, 'Página inválida.')
        const summaries = orders.slice((page - 1) * limit, page * limit).map(({ technicalReport, ...order }) => ({ ...order, hasReport: !!technicalReport }))
        return send(200, { equipment, orders: summaries, maintenance, total: orders.length, page, limit })
      }
      if (resource === 'service-orders' && id && action === 'offline-sync' && req.method === 'POST') return send(200, syncOfflineOrder(store, user, id, await body(req, 21000000)))
      if (resource === 'service-orders' && id && action === 'photos') {
        const order = store.get('service-orders', id)
        if (!order || (user.role === 'Técnico' && order.technicianId !== user.technician_id)) throw new HttpError(404, 'Ordem inexistente.')
        if (req.method === 'GET') return send(200, db.prepare('SELECT id,stage,caption,data,created_at AS createdAt FROM order_photos WHERE order_id=? ORDER BY created_at,id').all(id))
        if (!['Administrador', 'Gestor', 'Técnico'].includes(user.role)) throw new HttpError(403, 'Perfil sem permissão para anexar fotos.')
        if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.')
        const input = await body(req, 850000)
        if (Object.keys(input).some(key => !['stage', 'caption', 'data'].includes(key)) || !['Antes', 'Depois'].includes(input.stage) || typeof input.caption !== 'string' || input.caption.length > 300 || typeof input.data !== 'string') throw new HttpError(400, 'Foto inválida. Informe etapa e legenda de até 300 caracteres.')
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.data)
        const image = match && Buffer.from(match[1], 'base64')
        if (!image || image.length > 614400 || image.length < 4 || image[0] !== 255 || image[1] !== 216 || image[2] !== 255 || image.at(-2) !== 255 || image.at(-1) !== 217 || image.toString('base64') !== match[1]) throw new HttpError(400, 'Envie uma imagem JPEG de até 600 KB.')
        const photo = { id: randomUUID(), stage: input.stage, caption: input.caption.trim(), data: input.data, createdAt: new Date().toISOString() }
        db.exec('BEGIN IMMEDIATE')
        try {
          if (db.prepare('SELECT COUNT(*) AS count FROM order_photos WHERE order_id=?').get(id).count >= 12) throw new HttpError(409, 'Limite de 12 fotos por ordem atingido.')
          db.prepare('INSERT INTO order_photos(id,order_id,stage,caption,data,created_at,user_id) VALUES(?,?,?,?,?,?,?)').run(photo.id, id, photo.stage, photo.caption, photo.data, photo.createdAt, user.id)
          db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,after_data) VALUES(?,?,?,?,?,?)').run(randomUUID(), user.id, 'attach_photo', 'service-orders', id, JSON.stringify({ photoId: photo.id, stage: photo.stage, caption: photo.caption }))
          db.exec('COMMIT')
        } catch (error) { db.exec('ROLLBACK'); throw error }
        return send(201, photo)
      }
      if (!Object.hasOwn(schemas, resource)) throw new HttpError(404, 'Recurso inexistente.')
      if (req.method === 'GET') {
        if (!id) {
          const params = new URL(req.url, 'http://localhost').searchParams
          const paginated = ['page', 'limit', 'q', 'status'].some(key => params.has(key))
          const page = Number(params.get('page') || 1), limit = Number(params.get('limit') || 20), q = params.get('q') || '', status = params.get('status') || ''
          if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || q.length > 200 || status.length > 100) throw new HttpError(400, 'Parâmetros de paginação inválidos.')
          if (user.role === 'Técnico') {
            const allowed = technicianScope(store, user.technician_id)
            const records = (allowed[resource] || []).filter(item => (!q || JSON.stringify(item).toLocaleLowerCase().includes(q.toLocaleLowerCase())) && (!status || item.status === status))
            return send(200, paginated ? { items: records.slice((page - 1) * limit, page * limit), total: records.length, page, limit, totalPages: Math.ceil(records.length / limit) } : records)
          }
          return send(200, paginated ? store.page(resource, { page, limit, q, status }) : store.list(resource))
        }
        const item = store.get(resource, id)
        if (!item) throw new HttpError(404, 'Registro inexistente.')
        if (user.role === 'Técnico' && !technicianScope(store, user.technician_id)[resource]?.some(row => row.id === item.id)) throw new HttpError(404, 'Registro inexistente.')
        return send(200, item)
      }
      if (user.role === 'Técnico' && resource === 'service-orders' && req.method === 'PATCH' && id && action === 'technical-report') {
        const existing = store.get(resource, id)
        if (!existing || existing.technicianId !== user.technician_id) throw new HttpError(404, 'Ordem inexistente.')
        const input = await body(req, 11000000)
        const fields = ['diagnosis', 'workPerformed', 'materialsUsed', 'recommendations', 'checklist']
        if (Object.keys(input).some(key => !fields.includes(key)) || fields.slice(0, 2).some(field => typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 5000) || fields.slice(2, 4).some(field => input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > 5000))) throw new HttpError(400, 'Preencha o diagnóstico e o serviço executado; os demais campos são opcionais.')
        const technicalReport = {
          diagnosis: input.diagnosis.trim(), workPerformed: input.workPerformed.trim(),
          materialsUsed: (input.materialsUsed || '').trim(), recommendations: (input.recommendations || '').trim(),
          ...(input.checklist !== undefined ? { checklist: input.checklist } : existing.technicalReport?.checklist !== undefined ? { checklist: existing.technicalReport.checklist } : {}),
          technicianId: user.technician_id, updatedAt: new Date().toISOString(),
        }
        return send(200, store.save(resource, { ...existing, technicalReport }, true, user.id))
      }
      if (user.role === 'Técnico' && resource === 'service-orders' && req.method === 'PATCH' && id && !action) {
        const existing = store.get(resource, id)
        if (!existing || existing.technicianId !== user.technician_id) throw new HttpError(404, 'Ordem inexistente.')
        const input = await body(req)
        if (Object.keys(input).length !== 1 || !['Em andamento', 'Concluída'].includes(input.status) || (existing.status === 'Agendada' && input.status !== 'Em andamento') || (existing.status === 'Em andamento' && input.status !== 'Concluída') || existing.status === 'Concluída') throw new HttpError(400, 'Transição de status inválida.')
        return send(200, store.save(resource, { ...existing, status: input.status }, true, user.id))
      }
      if (!['Administrador', 'Gestor'].includes(user.role)) throw new HttpError(403, 'Perfil sem permissão para alterar cadastros.')
      if (req.method === 'POST' && !id) { const input = await body(req); if (input.id !== undefined) throw new HttpError(400, 'ID é gerado pelo servidor.'); if (resource === 'service-orders' && planningFields.some(field => input[field] !== undefined)) throw new HttpError(400, 'Gere OS vinculadas pela programação ou pelas pendências.'); return send(201, store.save(resource, { ...input, id: randomUUID() }, false, user.id)) }
      if (id && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const existing = store.get(resource, id); if (!existing) throw new HttpError(404, 'Registro inexistente.')
        if (req.method === 'DELETE') { if (user.role !== 'Administrador') throw new HttpError(403, 'Apenas administrador pode excluir.'); store.remove(resource, id, user.id); return send(204) }
        const input = await body(req); if (input.id !== undefined) throw new HttpError(400, 'ID não pode ser alterado.')
        if (resource === 'service-orders' && planningFields.some(field => input[field] !== undefined && input[field] !== existing[field])) throw new HttpError(400, 'Vínculo da OS e conclusão são controlados pelo sistema.')
        const preserved = resource === 'service-orders' ? Object.fromEntries(planningFields.filter(field => existing[field] !== undefined).map(field => [field, existing[field]])) : {}
        return send(200, store.save(resource, { ...(req.method === 'PATCH' ? existing : {}), ...preserved, ...input, id }, true, user.id))
      }
      throw new HttpError(405, 'Método não permitido.')
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('API failure:', error.message)
      send(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Erro interno.' })
    }
  })
  server.requestTimeout = 120000
  return { server, store }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server, store } = await createApp()
  server.listen(Number(process.env.PORT || 3001), process.env.HOST || '0.0.0.0', () => console.log('APP-ACC pronta'))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.db.close(); process.exit(0) }))
}
