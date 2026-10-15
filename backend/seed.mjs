import { openDatabase } from './database.mjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { clients, locations, equipment, climateSystems, technicians, serviceOrders, maintenanceItems } from '../src/mocks/operational.ts'
export function seedRecords(store) {
  if (store.db.prepare('SELECT COUNT(*) AS count FROM records').get().count) throw new Error('Seed permitido somente em banco vazio.')
  store.db.exec('BEGIN')
  try {
    const orders = serviceOrders.map(order => order.id === 'os-1051' ? { ...order, locationId: 'loc-01' } : order)
    for (const [resource, rows] of Object.entries({ clients, locations, 'climate-systems': climateSystems, technicians, equipment, 'service-orders': orders, maintenance: maintenanceItems })) for (const row of rows) store.save(resource, row)
    store.db.exec('COMMIT')
  } catch (error) { store.db.exec('ROLLBACK'); throw error }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed desativado em produção.')
  if (!process.env.DATABASE_PATH) throw new Error('Defina DATABASE_PATH explicitamente para um banco de testes vazio.')
  const store = openDatabase(process.env.DATABASE_PATH)
  try { seedRecords(store); console.log('Dados fictícios inseridos.') }
  finally { store.db.close() }
}
