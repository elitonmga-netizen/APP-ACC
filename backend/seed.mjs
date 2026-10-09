import { openDatabase } from './database.mjs'
import { clients, locations, equipment, climateSystems, technicians, serviceOrders, maintenanceItems } from '../src/mocks/operational.ts'
const store = openDatabase(process.env.DATABASE_PATH || 'backend/data/acc.sqlite')
let transaction = false
try {
  if (store.db.prepare('SELECT COUNT(*) AS count FROM records').get().count) throw new Error('Seed permitido somente em banco vazio.')
  store.db.exec('BEGIN')
  transaction = true
  const orders = serviceOrders.map(order => order.id === 'os-1051' ? { ...order, locationId: 'loc-01' } : order)
  for (const [resource, rows] of Object.entries({ clients, locations, 'climate-systems': climateSystems, technicians, equipment, 'service-orders': orders, maintenance: maintenanceItems })) for (const row of rows) store.save(resource, row)
  store.db.exec('COMMIT')
  transaction = false
  console.log('Dados fictícios inseridos.')
} catch (error) { if (transaction) store.db.exec('ROLLBACK'); throw error }
finally { store.db.close() }
