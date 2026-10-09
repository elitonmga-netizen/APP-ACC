import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { HttpError, schemas, validate } from './schema.mjs'
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;')
  if (db.prepare('PRAGMA user_version').get().user_version === 0) {
    db.exec('BEGIN')
    try { db.exec(readFileSync(new URL('./migrations/001.sql', import.meta.url), 'utf8')); db.exec('COMMIT') }
    catch (error) { db.exec('ROLLBACK'); db.close(); throw error }
  }
  const get = (resource, id) => { const row = db.prepare('SELECT data FROM records WHERE resource=? AND id=?').get(resource, id); return row && JSON.parse(row.data) }
  const list = resource => db.prepare('SELECT data FROM records WHERE resource=? ORDER BY rowid DESC').all(resource).map(row => JSON.parse(row.data))
  return { db, get, list,
    save(resource, input, existing = false) {
      validate(resource, input, get)
      if (!existing && get(resource, input.id)) throw new HttpError(409, 'ID já cadastrado.')
      const prospectiveGet = (target, id) => target === resource && id === input.id ? input : get(target, id)
      for (const [other, schema] of Object.entries(schemas)) {
        const fields = Object.entries(schema).filter(([, target]) => target === resource).map(([field]) => field)
        if (fields.length) for (const record of list(other)) {
          if (fields.some(field => record[field] === input.id)) validate(other, record, prospectiveGet)
        }
      }
      db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(resource,id) DO UPDATE SET data=excluded.data').run(resource, input.id, JSON.stringify(input))
      return input
    },
    remove(resource, id) {
      for (const [other, schema] of Object.entries(schemas)) {
        for (const [field, target] of Object.entries(schema)) {
          if (target === resource && list(other).some(row => row[field] === id)) throw new HttpError(409, 'Registro vinculado a outros cadastros.')
        }
      }
      db.prepare('DELETE FROM records WHERE resource=? AND id=?').run(resource, id)
    },
  }
}
