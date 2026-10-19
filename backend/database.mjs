import { captureNonconformities, completeCorrectiveOrder } from './corrective-actions.mjs'
import { localDay, maintenanceStatus, nextMaintenanceDue } from './maintenance-planning.mjs'
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
  if (db.prepare('PRAGMA user_version').get().user_version === 3) db.exec(readFileSync(new URL('./migrations/004.sql', import.meta.url), 'utf8'))
  if (db.prepare('PRAGMA user_version').get().user_version === 4) db.exec(readFileSync(new URL('./migrations/005.sql', import.meta.url), 'utf8'))
  const get = (resource, id) => { const row = db.prepare('SELECT data FROM records WHERE resource=? AND id=?').get(resource, id); const value = row && JSON.parse(row.data); return value && resource === 'maintenance' && value.schedule ? { ...value, status: maintenanceStatus(value) } : value }
  const list = resource => db.prepare('SELECT data FROM records WHERE resource=? ORDER BY rowid DESC').all(resource).map(row => { const value = JSON.parse(row.data); return resource === 'maintenance' && value.schedule ? { ...value, status: maintenanceStatus(value) } : value })
  const store = { db, get, list,
    save(resource, input, existing = false, actorId = null) {
      const previous = existing ? get(resource, input.id) : null
      if (resource === 'service-orders') {
        if ((previous?.maintenanceId || previous?.correctiveActionId) && previous.status === 'Concluída' && input.status !== 'Concluída') throw new HttpError(409, 'OS vinculada concluída não pode ser reaberta.')
        if (input.status === 'Concluída' && previous?.status !== 'Concluída') input = { ...input, completedAt: previous?.completedAt || new Date().toISOString() }
        else if (previous?.completedAt) input = { ...input, completedAt: previous.completedAt }
      }
      if (resource === 'maintenance' && previous && previous.equipmentId !== input.equipmentId && list('service-orders').some(order => order.maintenanceId === input.id)) throw new HttpError(409, 'Crie outra preventiva para trocar o equipamento e preservar o histórico.')
      if (resource === 'maintenance' && previous && list('service-orders').some(order => order.maintenanceId === input.id && order.status !== 'Concluída') && ['equipmentId', 'technicianId', 'title', 'frequency', 'dueDate', 'schedule'].some(key => JSON.stringify(previous[key]) !== JSON.stringify(input[key]))) throw new HttpError(409, 'Conclua a OS preventiva em aberto antes de alterar a programação.')
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
      const savepoint = 'acc_save_' + randomUUID().replaceAll('-', '')
      db.exec(`SAVEPOINT ${savepoint}`)
      try {
        db.prepare('INSERT INTO records VALUES(?,?,?) ON CONFLICT(resource,id) DO UPDATE SET data=excluded.data').run(resource, input.id, JSON.stringify(input))
        if (actorId) db.prepare('INSERT INTO audit_log(id,user_id,action,resource,resource_id,before_data,after_data) VALUES(?,?,?,?,?,?,?)').run(randomUUID(), actorId, existing ? 'update' : 'create', resource, input.id, before ? JSON.stringify(before) : null, JSON.stringify(input))
        if (resource === 'service-orders' && input.maintenanceId && input.status === 'Concluída' && before?.status !== 'Concluída') {
          const item = get('maintenance', input.maintenanceId)
          if (!item?.schedule || item.schedule.nextDue !== input.maintenanceDue) throw new HttpError(409, 'Programação da preventiva mudou. Revise a OS antes de concluir.')
          const nextDue = nextMaintenanceDue(input.maintenanceDue, item.schedule, localDay(new Date(input.completedAt)))
          store.save('maintenance', { ...item, dueDate: nextDue, schedule: { ...item.schedule, nextDue }, status: 'Em dia' }, true, actorId)
          const equipment = get('equipment', input.equipmentId)
          store.save('equipment', { ...equipment, lastMaintenance: localDay(new Date(input.completedAt)) }, true, actorId)
        }
        if (resource === 'service-orders') {
          captureNonconformities(store, input, actorId)
          if (input.correctiveActionId && input.status === 'Concluída' && before?.status !== 'Concluída') completeCorrectiveOrder(store, input, actorId)
        }
        db.exec(`RELEASE ${savepoint}`)
      } catch (error) { db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`); throw error }
      return input
    },
    remove(resource, id, actorId = null) {
      if (resource === 'corrective-actions' || resource === 'service-orders' && get(resource, id)?.correctiveActionId) throw new HttpError(409, 'Pendência e OS corretiva devem ser preservadas no histórico.')
      if (resource === 'maintenance' && list('service-orders').some(order => order.maintenanceId === id)) throw new HttpError(409, 'Preventiva vinculada a OS deve ser preservada no histórico.')
      if (resource === 'service-orders' && get(resource, id)?.maintenanceId) throw new HttpError(409, 'OS preventiva vinculada deve ser preservada no histórico.')
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
  return store
}
