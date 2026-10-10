import { openDatabase } from './database.mjs'
import { createUser } from './auth.mjs'

const { db } = openDatabase(process.env.DATABASE_PATH || 'backend/data/acc.sqlite')
try {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
  if (existing) {
    console.log('Banco já inicializado; criação inicial ignorada.')
  } else {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD para inicializar o primeiro administrador.')
    await createUser(db, { email: process.env.ADMIN_EMAIL, name: process.env.ADMIN_NAME || 'Administrador', password: process.env.ADMIN_PASSWORD, role: 'Administrador' })
    console.log('Primeiro administrador criado.')
  }
} finally { db.close() }
