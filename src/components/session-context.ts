import { createContext, useContext } from 'react'
import type { User } from '../services/api'
export const UserContext = createContext<User | null>(null)
export const useSessionUser = () => useContext(UserContext)
