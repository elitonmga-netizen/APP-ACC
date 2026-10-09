import { randomBytes, scrypt, timingSafeEqual, createHash, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { HttpError, roles } from './schema.mjs'
const derive = promisify(scrypt)
export const digest = value => createHash('sha256').update(value).digest('hex')
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `${salt}:${hash.toString('hex')}`
}
export async function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':')
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'))
}
export const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role })
export async function createUser(db, input) {
  if (!input || Object.keys(input).some(key => !['email', 'name', 'password', 'role'].includes(key)) || typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256 || !roles.includes(input.role)) throw new HttpError(400, 'Nome, email, perfil e senha (12 a 256 caracteres) são obrigatórios.')
  const email = input.email.toLowerCase().trim()
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new HttpError(409, 'Email já cadastrado.')
  const user = { id: randomUUID(), email, name: input.name.trim(), role: input.role }
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user.id, email, user.name, user.role, await hashPassword(input.password))
  return user
}
