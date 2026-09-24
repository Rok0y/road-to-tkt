import { useState } from 'react'

const IN_APP = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|Snapchat|LinkedInApp|TikTok|musical_ly|Twitter|GSA\//i

/** Navigateurs intégrés aux apps (Messenger, Instagram…) : stockage limité, pas d'installation possible. */
export function isInAppBrowser(ua = navigator.userAgent): boolean {
  return IN_APP.test(ua)
}

export function InAppBrowser({ onContinue }: { onContinue: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = location.href

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      prompt("Copie l'adresse :", url)
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontSize: 40, textAlign: 'center' }}>🧭</div>
        <h1 style={{ fontSize: 22, textAlign: 'center', margin: '8px 0 12px' }}>Ouvre l'app dans Safari</h1>
        <p>
          Tu es dans le navigateur intégré d'une autre app (Messenger, Instagram…). Il ne peut pas conserver tes pesées ni
          installer l'app sur l'écran d'accueil.
        </p>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
          <li>
            Touche <strong>•••</strong> en haut à droite.
          </li>
          <li>
            Choisis <strong>« Ouvrir dans le navigateur externe »</strong> (ou « Ouvrir dans Safari »).
          </li>
          <li>
            Dans Safari : <strong>Partager → « Sur l'écran d'accueil »</strong>.
          </li>
        </ol>
        <button className="btn" onClick={copy}>
          {copied ? 'Adresse copiée ✓ — colle-la dans Safari' : "Copier l'adresse"}
        </button>
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={onContinue}>
          Continuer quand même
        </button>
      </div>
    </div>
  )
}
