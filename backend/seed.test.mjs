import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { openDatabase } from './database.mjs'
import { seedRecords } from './seed.mjs'

test('seed: carga completa, vínculos consistentes e segunda carga bloqueada', () => {
  const store = openDatabase(':memory:')
  try {
    seedRecords(store)
    assert.equal(store.list('clients').length, 4)
    assert.equal(store.list('service-orders').length, 4)
    assert.equal(store.get('service-orders', 'os-1051').locationId, 'loc-01')
    const before = store.db.prepare('SELECT * FROM records ORDER BY resource,id').all()
    assert.throws(() => seedRecords(store), /banco vazio/)
    assert.deepEqual(store.db.prepare('SELECT * FROM records ORDER BY resource,id').all(), before)
  } finally { store.db.close() }
})

test('seed: falha intermediária reverte toda a carga e permite tentar novamente', () => {
  const store = openDatabase(':memory:')
  let count = 0
  try {
    assert.throws(() => seedRecords({ ...store, save: (...args) => {
      if (++count === 6) throw new Error('Falha simulada')
      return store.save(...args)
    } }), /Falha simulada/)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 0)
    seedRecords(store)
    assert.equal(store.list('equipment').length, 4)
  } finally { store.db.close() }
})

test('seed CLI: bloqueia produção e exige caminho explícito antes de abrir banco', () => {
  for (const env of [{ NODE_ENV: 'production', DATABASE_PATH: ':memory:' }, { NODE_ENV: 'development', DATABASE_PATH: '' }]) {
    const child = spawnSync(process.execPath, ['backend/seed.mjs'], { env: { ...process.env, ...env }, encoding: 'utf8' })
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, env.NODE_ENV === 'production' ? /desativado em produção/ : /DATABASE_PATH explicitamente/)
  }
})

test('seed CLI: executa carga fictícia em banco explicitamente isolado', () => {
  const child = spawnSync(process.execPath, ['backend/seed.mjs'], { env: { ...process.env, NODE_ENV: 'development', DATABASE_PATH: ':memory:' }, encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  assert.match(child.stdout, /Dados fictícios inseridos/)
})
