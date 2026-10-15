import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './database.mjs'
import { createUser } from './auth.mjs'
import { createApp } from './server.mjs'
import { assertPermanentEnvironment, createBackup, pruneBackups, permanentBackupDirectory } from './backup.mjs'

export function validatePermanentConfig(env = process.env) {
  assertPermanentEnvironment(env)
  const url = new URL(env.CORS_ORIGIN || env.RENDER_EXTERNAL_URL || '')
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== url.href.replace(/\/$/, '')) throw new Error('Configure uma origem HTTPS válida para homologação.')
  if (!env.ADMIN_EMAIL || typeof env.ADMIN_PASSWORD !== 'string' || env.ADMIN_PASSWORD.length < 24 || env.ADMIN_PASSWORD.length > 256) throw new Error('Defina credenciais administrativas novas; senha de 24 a 256 caracteres.')
  return url.origin
}

// Sem seed: banco exclusivo novo recebe somente seu primeiro administrador.
export async function initializePermanentDatabase(file, env) {
  const store = openDatabase(file)
  try {
    if (!store.db.prepare('SELECT COUNT(*) AS count FROM users').get().count) {
      if (store.db.prepare('SELECT COUNT(*) AS count FROM records').get().count) throw new Error('Banco contém registros sem contas; inicialização bloqueada.')
      await createUser(store.db, { email: env.ADMIN_EMAIL, name: env.ADMIN_NAME || 'Administrador mobile', password: env.ADMIN_PASSWORD, role: 'Administrador' })
    }
  } finally { store.db.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const origin = validatePermanentConfig()
  const databasePath = assertPermanentEnvironment()
  await initializePermanentDatabase(databasePath, process.env)
  const snapshot = async () => {
    await createBackup(databasePath, permanentBackupDirectory)
    await pruneBackups(permanentBackupDirectory, 7)
    console.log('Backup SQLite de homologação verificado.')
  }
  await snapshot()
  let backingUp = false
  const timer = setInterval(async () => {
    if (backingUp) return
    backingUp = true
    try { await snapshot() } catch (error) { console.error('Falha no backup de homologação:', error.message) }
    finally { backingUp = false }
  }, 24 * 60 * 60 * 1000)
  timer.unref()
  const { server, store } = await createApp({ databasePath, origin, secure: true })
  server.listen(Number(process.env.PORT || 3003), process.env.HOST || '127.0.0.1', () => console.log('Homologação mobile permanente pronta.'))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    clearInterval(timer)
    server.close(() => { store.db.close(); process.exit(0) })
  })
}
