import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { HttpError, schemas, validate } from './schema.mjs'
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;')
  const version = db.prepare('PRAGMA user_version').get().user_version
  if (version === 0) {
    db.exec('BEGIN')
    try { db.exec(readFileSync(new URL('./migrations/001.sql', import.meta.url), 'utf8')); db.exec('COMMIT') }
    catch (error) { db.exec('ROLLBACK'); db.close(); throw error }
  }
  if (db.prepare('PRAGMA user_version').get().user_version === 1) db.exec(readFileSync(new URL('./migrations/002.sql', import.meta.url), 'utf8'))
  if (db.prepare('PRAGMA user_version').get().user_version === 2) db.exec(readFileSync(new URL('./migrations/003.sql', import.meta.url), 'utf8'))
  const get = (resource, id) => { const row = db.prepare('SELECT data FROM records WHERE resource=? AND id=?').get(resource, id); return row && JSON.parse(row.data) }
  const list = resource => db.prepare('SELECT data FROM records WHERE resource=? ORDER BY rowid DESC').all(resource).map(row => JSON.parse(row.data))
  return { db, get, list,
    save(resource, input, existing = false, actorId = null) {
      validate(resource, input, get)
      if (!existing && get(resource, input.id)) throw new HttpError(409, 'ID já cadastrado.')
      const before = existing ? get(resource, input.id) : null
      const prospectiveGet = (target, id) => target === resource && id === input.id ? input : get(target, id)
      for (const [other, schema] of Object.entries(schemas)) {
        const fields = Object.entries(schema).filter(([, target]) => target === resource).map(([field]) => field)
        if (fields.length) for (const record of list(other)) {
          if (fields.some(field => record[field] === input.id)) validate(other, record, prospectiveGet)
        }
      }
      db.exec('BEGIN')
      try {
        db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(resource,id) DO UPDATE SET data=excluded.data').run(resource, input.id, JSON.stringify(input))
        if (actorId) db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,before_data,after_data) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), actorId, existing ? 'update' : 'create', resource, input.id, before ? JSON.stringify(before) : null, JSON.stringify(input))
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      return input
    },
    remove(resource, id, actorId = null) {
      for (const [other, schema] of Object.entries(schemas)) {
        for (const [field, target] of Object.entries(schema)) {
          if (target === resource && list(other).some(row => row[field] === id)) throw new HttpError(409, 'Registro vinculado a outros cadastros.')
        }
      }
      const before = get(resource, id)
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM records WHERE resource=? AND id=?').run(resource, id)
        if (actorId) db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,before_data) VALUES(?,?,?,?,?,?)').run(randomUUID(), actorId, 'delete', resource, id, JSON.stringify(before))
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    page(resource, { page = 1, limit = 20, q = '', status = '' } = {}) {
      const references = {
        locations: ['clients'], equipment: ['clients', 'locations', 'climate-systems'],
        'service-orders': ['clients', 'locations', 'equipment', 'technicians'], maintenance: ['equipment', 'technicians'],
      }
      const needle = q.toLocaleLowerCase()
      const records = list(resource).filter(item => {
        const linked = (references[resource] || []).flatMap(target => Object.values(get(target, item[`${target === 'clients' ? 'client' : target === 'locations' ? 'location' : target === 'equipment' ? 'equipment' : target === 'technicians' ? 'technician' : 'system'}Id`]) || {}))
        return (!q || JSON.stringify([item, ...linked]).toLocaleLowerCase().includes(needle)) && (!status || item.status === status)
      })
      const start = (page - 1) * limit
      return { items: records.slice(start, start + limit), total: records.length, page, limit, totalPages: Math.ceil(records.length / limit) }
    },
  }
}
