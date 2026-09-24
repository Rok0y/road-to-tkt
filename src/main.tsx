import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { db } from './db/db'
import { ErrorBoundary, StartupError } from './components/StartupError'
import { InAppBrowser, isInAppBrowser } from './components/InAppBrowser'
import './styles/theme.css'

registerSW({ immediate: true })

// Demande au navigateur de ne jamais purger nos données (poids + photos) en cas de manque d'espace.
navigator.storage?.persist?.().catch(() => {})

const root = createRoot(document.getElementById('root')!)

/**
 * Ouvre la base et y fait une vraie lecture par curseur, comme l'app le fera ensuite :
 * certains navigateurs (intégrés à Messenger, cookies bloqués…) ouvrent la base puis échouent à la lecture.
 */
async function checkStorage() {
  await db.open()
  await db.entries.orderBy('date').first()
  await db.photos.orderBy('date').uniqueKeys()
}

function start() {
  checkStorage()
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
}

if (isInAppBrowser()) root.render(<InAppBrowser onContinue={start} />)
else start()
