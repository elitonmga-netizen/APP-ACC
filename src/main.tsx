import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './styles/operational.css'
import './styles/mobile.css'
import { registerPwa } from './services/pwa'
registerPwa()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
