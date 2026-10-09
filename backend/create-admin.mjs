import { openDatabase } from './database.mjs'
import { createUser } from './auth.mjs'
const { db } = openDatabase(process.env.DATABASE_PATH || 'backend/data/acc.sqlite')
try {
  await createUser(db, { email: process.env.ADMIN_EMAIL, name: process.env.ADMIN_NAME || 'Administrador', password: process.env.ADMIN_PASSWORD, role: 'Administrador' })
  console.log('Administrador criado. Remova ADMIN_PASSWORD do ambiente.')
} finally { db.close() }
