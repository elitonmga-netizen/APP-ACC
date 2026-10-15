// Entry point exclusivo de homologação: nunca usa o caminho de banco de produção.
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './database.mjs'
import { seedRecords } from './seed.mjs'
import { createUser } from './auth.mjs'
import { createApp } from './server.mjs'

export const stagingDatabasePath = resolve(tmpdir(), 'app-acc-mobile-staging', 'acc.sqlite')

export async function prepareStaging(env = process.env) {
  if (env.ACC_STAGING !== 'fictitious-only' || !env.DATABASE_PATH || resolve(env.DATABASE_PATH) !== stagingDatabasePath) {
    throw new Error('Homologação exige ACC_STAGING=fictitious-only e DATABASE_PATH exclusivo em ' + stagingDatabasePath)
  }
  if (typeof env.STAGING_PASSWORD !== 'string' || env.STAGING_PASSWORD.length < 12 || env.STAGING_PASSWORD.length > 256) {
    throw new Error('Defina STAGING_PASSWORD com 12 a 256 caracteres somente no ambiente do serviço.')
  }
  const store = openDatabase(stagingDatabasePath)
  try {
    if (!store.db.prepare('SELECT COUNT(*) AS count FROM records').get().count) seedRecords(store)
    for (const account of [
      { email: 'admin@example.test', name: 'Administrador fictício', role: 'Administrador' },
      { email: 'tecnico@example.test', name: 'Lucas fictício', role: 'Técnico', technicianId: 'tec-01' },
      { email: 'tecnica@example.test', name: 'Ana fictícia', role: 'Técnico', technicianId: 'tec-02' },
    ]) {
      if (!store.db.prepare('SELECT id FROM users WHERE email=?').get(account.email)) await createUser(store.db, { ...account, password: env.STAGING_PASSWORD })
    }
  } finally { store.db.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await prepareStaging()
  const { server, store } = await createApp({ databasePath: stagingDatabasePath, secure: true })
  server.listen(Number(process.env.PORT || 3002), process.env.HOST || '127.0.0.1', () => console.log('Homologação mobile: somente dados fictícios; banco temporário.'))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.db.close(); process.exit(0) }))
}
