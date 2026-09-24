import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { db } from './db/db'
import { ErrorBoundary, StartupError } from './components/StartupError'
import './styles/theme.css'

registerSW({ immediate: true })

// Demande au navigateur de ne jamais purger nos données (poids + photos) en cas de manque d'espace.
navigator.storage?.persist?.().catch(() => {})

const root = createRoot(document.getElementById('root')!)

// On ouvre la base avant d'afficher l'app : si Safari bloque le stockage
// (cookies bloqués, navigation privée, mode Isolement), on l'explique au lieu d'une page blanche.
db.open()
  .then(() =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    ),
  )
  .catch((error) => root.render(<StartupError error={error} storage />))
