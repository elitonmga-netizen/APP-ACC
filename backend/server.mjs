import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { openDatabase } from './database.mjs'
import { createUser, digest, hashPassword, publicUser, verifyPassword } from './auth.mjs'
import { HttpError, schemas } from './schema.mjs'
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use application/json.')
  let text = ''
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 32768) throw new HttpError(413, 'Corpo muito grande.') }
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value }
  catch { throw new HttpError(400, 'JSON inválido.') }
}
export async function createApp({ databasePath = process.env.DATABASE_PATH || 'backend/data/acc.sqlite', origin = process.env.CORS_ORIGIN || 'http://localhost:5173', secure = process.env.NODE_ENV === 'production' } = {}) {
  const store = openDatabase(databasePath)
  const { db } = store
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'))
  const attempts = new Map()
  const cookie = (token, age) => `acc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`
  const server = createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status); res.end(data === undefined ? undefined : JSON.stringify(data)) }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'Origem não permitida.')
      if (req.headers.origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin') }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ACC-Request'); return send(204) }
      const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean)
      if (parts[0] !== 'api' || parts.length > 3) throw new HttpError(404, 'Rota inexistente.')
      const [, resource, rawId] = parts
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
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(input.email.trim().toLowerCase())
        const valid = await verifyPassword(input.password, user?.password_hash || dummyHash)
        if (!user || !valid) throw new HttpError(401, 'Email ou senha inválidos.')
        attempts.delete(key)
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now)
        const token = randomBytes(32).toString('hex')
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), user.id, now + 28800000)
        res.setHeader('Set-Cookie', cookie(token, 28800)); return send(200, publicUser(user))
      }
      const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('acc_session='))?.slice(12)
      const user = token && db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(digest(token), Date.now())
      if (!user) throw new HttpError(401, 'Faça login para continuar.')
      if (resource === 'auth' && id === 'me' && req.method === 'GET') return send(200, publicUser(user))
      if (resource === 'auth' && id === 'logout' && req.method === 'POST') { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); res.setHeader('Set-Cookie', cookie('', 0)); return send(204) }
      if (resource === 'users' && req.method === 'POST' && !id) { if (user.role !== 'Administrador') throw new HttpError(403, 'Apenas administrador.'); return send(201, await createUser(db, await body(req))) }
      if (!Object.hasOwn(schemas, resource)) throw new HttpError(404, 'Recurso inexistente.')
      if (req.method === 'GET') { if (!id) return send(200, store.list(resource)); const item = store.get(resource, id); if (!item) throw new HttpError(404, 'Registro inexistente.'); return send(200, item) }
      if (!['Administrador', 'Gestor'].includes(user.role)) throw new HttpError(403, 'Perfil sem permissão para alterar cadastros.')
      if (req.method === 'POST' && !id) { const input = await body(req); if (input.id !== undefined) throw new HttpError(400, 'ID é gerado pelo servidor.'); return send(201, store.save(resource, { ...input, id: randomUUID() })) }
      if (id && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const existing = store.get(resource, id); if (!existing) throw new HttpError(404, 'Registro inexistente.')
        if (req.method === 'DELETE') { if (user.role !== 'Administrador') throw new HttpError(403, 'Apenas administrador pode excluir.'); store.remove(resource, id); return send(204) }
        const input = await body(req); if (input.id !== undefined) throw new HttpError(400, 'ID não pode ser alterado.')
        return send(200, store.save(resource, { ...(req.method === 'PATCH' ? existing : {}), ...input, id }, true))
      }
      throw new HttpError(405, 'Método não permitido.')
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('API failure:', error.message)
      send(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Erro interno.' })
    }
  })
  server.requestTimeout = 15000
  return { server, store }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server, store } = await createApp()
  server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log('APP-ACC API pronta'))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.db.close(); process.exit(0) }))
}
