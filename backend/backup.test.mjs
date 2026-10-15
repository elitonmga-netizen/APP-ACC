import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from './database.mjs'
import { seedRecords } from './seed.mjs'
import { createUser, verifyPassword } from './auth.mjs'
import { createBackup, restoreBackup, pruneBackups, assertPermanentEnvironment } from './backup.mjs'
import { initializePermanentDatabase, validatePermanentConfig } from './permanent-staging.mjs'

test('backup: snapshot consistente de WAL aberto, relatório/auditoria preservados e sessões revogadas na recuperação', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-recovery-test-'))
  const source = join(dir, 'source.sqlite'), target = join(dir, 'restored.sqlite')
  const store = openDatabase(source)
  try {
    seedRecords(store)
    const password = 'Permanent-test-only-new-password-2026!'
    const user = await createUser(store.db, { email: 'new-admin@example.test', name: 'Teste', role: 'Administrador', password })
    store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('session-test', user.id, Date.now() + 60000)
    store.db.prepare('INSERT INTO password_reset_tokens VALUES(?,?,?)').run('reset-test', user.id, Date.now() + 60000)
    const order = { ...store.get('service-orders', 'os-1051'), status: 'Concluída', technicalReport: { diagnosis: 'Teste fictício', workPerformed: 'Inspeção fictícia', materialsUsed: '', recommendations: '', technicianId: 'tec-01', updatedAt: new Date().toISOString() } }
    store.save('service-orders', order, true, user.id)
    store.db.prepare('INSERT INTO order_photos(id,order_id,stage,caption,data,created_at,user_id) VALUES(?,?,?,?,?,?,?)').run('backup-photo', order.id, 'Depois', 'Foto de teste', 'data:image/jpeg;base64,test', new Date().toISOString(), user.id)
    const snapshot = await createBackup(source, join(dir, 'backups'))
    assert.equal(snapshot.records, store.db.prepare('SELECT COUNT(*) AS n FROM records').get().n)
    assert.equal(snapshot.users, 1)
    await restoreBackup(snapshot.file, target)
    const restored = openDatabase(target)
    try {
      assert.deepEqual(restored.get('service-orders', 'os-1051'), order)
      assert.deepEqual(restored.db.prepare('SELECT * FROM order_photos').all(), store.db.prepare('SELECT * FROM order_photos').all())
      assert.deepEqual(restored.db.prepare('SELECT * FROM records ORDER BY resource,id').all(), store.db.prepare('SELECT * FROM records ORDER BY resource,id').all())
      assert.equal(restored.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, 1)
      assert.equal(restored.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
      assert.equal(restored.db.prepare('SELECT COUNT(*) AS n FROM password_reset_tokens').get().n, 0)
      assert.ok(await verifyPassword(password, restored.db.prepare('SELECT password_hash FROM users').get().password_hash))
      assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1)
      await assert.rejects(restoreBackup(snapshot.file, target), { code: 'EEXIST' })
      writeFileSync(snapshot.file, 'corrompido')
      await assert.rejects(restoreBackup(snapshot.file, join(dir, 'invalid.sqlite')), /Checksum/)
      assert.equal(existsSync(join(dir, 'invalid.sqlite')), false)
    } finally { restored.db.close() }
  } finally { store.db.close(); rmSync(dir, { recursive: true }) }
})

test('backup: retenção preserva arquivos desconhecidos e guardas recusam produção', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-retention-test-'))
  const store = openDatabase(join(dir, 'source.sqlite'))
  try {
    const backups = join(dir, 'backups')
    await createBackup(join(dir, 'source.sqlite'), backups)
    await createBackup(join(dir, 'source.sqlite'), backups)
    writeFileSync(join(backups, 'manual.sqlite'), 'preservar')
    await pruneBackups(backups, 1)
    assert.equal(readdirSync(backups).filter(name => name.startsWith('acc-snapshot-') && name.endsWith('.sqlite')).length, 1)
    assert.equal(readFileSync(join(backups, 'manual.sqlite'), 'utf8'), 'preservar')
    assert.throws(() => assertPermanentEnvironment({ ACC_ENVIRONMENT: 'mobile-homologacao', DATABASE_PATH: '/var/data/acc.sqlite' }), /somente/)
    assert.throws(() => validatePermanentConfig({}), /somente/)
    assert.throws(() => validatePermanentConfig({ ACC_ENVIRONMENT: 'mobile-homologacao', DATABASE_PATH: '/var/acc-mobile-homologacao/acc.sqlite', RENDER_EXTERNAL_URL: 'http://example.test' }), /HTTPS/)
  } finally { store.db.close(); rmSync(dir, { recursive: true }) }
})

test('homologação permanente: cria só administrador novo e preserva banco e senha em reinícios', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-permanent-test-'))
  const file = join(dir, 'new.sqlite')
  try {
    const env = { ADMIN_EMAIL: 'permanent@example.test', ADMIN_PASSWORD: 'New-independent-credential-2026!' }
    await initializePermanentDatabase(file, env)
    const store = openDatabase(file)
    let hash
    try {
      assert.equal(store.list('clients').length, 0)
      assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1)
      hash = store.db.prepare('SELECT password_hash FROM users').get().password_hash
      seedRecords(store)
    } finally { store.db.close() }
    await initializePermanentDatabase(file, { ...env, ADMIN_PASSWORD: 'Different-password-must-not-replace!' })
    const reopened = openDatabase(file)
    try {
      assert.equal(reopened.list('clients').length, 4)
      assert.equal(reopened.db.prepare('SELECT password_hash FROM users').get().password_hash, hash)
    } finally { reopened.db.close() }
  } finally { rmSync(dir, { recursive: true }) }
})
