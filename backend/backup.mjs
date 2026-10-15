import { DatabaseSync, backup } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile, readdir, unlink, chmod } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const permanentDatabasePath = '/var/acc-mobile-homologacao/acc.sqlite'
export const permanentBackupDirectory = '/var/acc-mobile-homologacao/backups'
const checksum = bytes => createHash('sha256').update(bytes).digest('hex')

export function inspectDatabase(file) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const check = db.prepare('PRAGMA integrity_check').all()
    if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') throw new Error('Integridade SQLite inválida.')
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Chaves estrangeiras inválidas.')
    const version = db.prepare('PRAGMA user_version').get().user_version
    if (![3, 4, 5].includes(version)) throw new Error('Versão de banco incompatível.')
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name)
    for (const table of ['records', 'users', 'sessions', 'audit_log', 'password_reset_tokens']) {
      if (!tables.includes(table)) throw new Error('Backup incompleto: tabela ausente ' + table)
    }
    if (version >= 4 && !tables.includes('order_photos')) throw new Error('Backup incompleto: fotos ausentes.')
    if (version >= 5 && !tables.includes('offline_receipts')) throw new Error('Backup incompleto: recibos de sincronização ausentes.')
    return { version, records: db.prepare('SELECT COUNT(*) AS count FROM records').get().count, users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count }
  } finally { db.close() }
}

export async function createBackup(source, directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = join(directory, `acc-snapshot-${Date.now()}-${randomUUID()}.sqlite`)
  const db = new DatabaseSync(source, { readOnly: true })
  try { await backup(db, file) } finally { db.close() }
  await chmod(file, 0o600)
  const info = inspectDatabase(file)
  const manifest = { createdAt: new Date().toISOString(), sha256: checksum(await readFile(file)), ...info }
  await writeFile(file + '.json', JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 })
  return { file, ...manifest }
}

export async function restoreBackup(file, target) {
  if (resolve(file) === resolve(target)) throw new Error('Origem e destino devem ser diferentes.')
  const manifest = JSON.parse(await readFile(file + '.json', 'utf8'))
  if (manifest.sha256 !== checksum(await readFile(file))) throw new Error('Checksum do backup inválido.')
  inspectDatabase(file)
  await mkdir(dirname(target), { recursive: true, mode: 0o700 })
  // Nunca substitui um banco existente: recuperação sempre em arquivo novo.
  await copyFile(file, target, constants.COPYFILE_EXCL)
  await chmod(target, 0o600)
  const db = new DatabaseSync(target)
  try {
    db.exec('BEGIN; DELETE FROM sessions; DELETE FROM password_reset_tokens; COMMIT;')
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally { db.close() }
  return inspectDatabase(target)
}

export async function pruneBackups(directory, keep = 7) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('Retenção inválida.')
  const names = (await readdir(directory)).filter(name => /^acc-snapshot-\d+-[a-f0-9-]{36}\.sqlite$/.test(name)).sort().reverse()
  // Somente pares completos produzidos por este módulo; preservar arquivos desconhecidos.
  const complete = []
  for (const name of names) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, name + '.json'), 'utf8'))
      if (manifest.sha256 === checksum(await readFile(join(directory, name)))) {
        inspectDatabase(join(directory, name))
        complete.push(name)
      }
    } catch { /* Backup incompleto preservado para investigação. */ }
  }
  for (const name of complete.slice(keep)) {
    await unlink(join(directory, name)); await unlink(join(directory, name + '.json'))
  }
}

export function assertPermanentEnvironment(env = process.env) {
  const restored = /^\/var\/acc-mobile-homologacao\/restored\/acc-restored-[a-zA-Z0-9-]+\.sqlite$/.test(env.DATABASE_PATH || '')
  if (env.ACC_ENVIRONMENT !== 'mobile-homologacao' || (env.DATABASE_PATH !== permanentDatabasePath && !restored)) {
    throw new Error('Operação permitida somente no banco exclusivo de homologação permanente.')
  }
  return env.DATABASE_PATH
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = assertPermanentEnvironment()
  const [action, file, target] = process.argv.slice(2)
  if (action === 'create') console.log(JSON.stringify(await createBackup(source, permanentBackupDirectory)))
  else if (action === 'restore' && file && target && /^\/var\/acc-mobile-homologacao\/restored\/acc-restored-[a-zA-Z0-9-]+\.sqlite$/.test(target)) {
    console.log(JSON.stringify(await restoreBackup(file, target)))
  } else throw new Error('Use: node backend/backup.mjs create | restore <backup.sqlite> /var/acc-mobile-homologacao/restored/acc-restored-<identificador>.sqlite')
}
