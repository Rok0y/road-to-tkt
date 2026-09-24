import { Component, type ReactNode } from 'react'

/** Écran affiché à la place d'une page blanche quand l'app ne peut pas démarrer. */
export function StartupError({ error, storage }: { error: unknown; storage?: boolean }) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return (
    <div className="page">
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontSize: 40, textAlign: 'center' }}>⚠️</div>
        <h1 style={{ fontSize: 22, textAlign: 'center', margin: '8px 0 12px' }}>
          {storage ? 'Stockage indisponible' : "L'app a rencontré une erreur"}
        </h1>
        {storage ? (
          <>
            <p>Safari empêche l'app d'enregistrer tes données sur l'appareil. Pour corriger :</p>
            <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
              <li>
                Réglages → <strong>Apps → Safari</strong> : désactive <strong>« Bloquer tous les cookies »</strong>.
              </li>
              <li>
                N'utilise pas la <strong>navigation privée</strong>.
              </li>
              <li>
                Si le <strong>mode Isolement</strong> est activé, exclus ce site (Réglages → Confidentialité et sécurité).
              </li>
              <li>Puis recharge la page.</li>
            </ol>
          </>
        ) : (
          <p>Recharge la page. Si le problème persiste, envoie une capture de cet écran.</p>
        )}
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 12,
            background: 'var(--fill)',
            padding: 10,
            borderRadius: 8,
            color: 'var(--secondary)',
          }}
        >
          {message}
          {'\n'}
          {navigator.userAgent}
        </pre>
        <button className="btn" onClick={() => location.reload()}>
          Recharger
        </button>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    return this.state.error ? <StartupError error={this.state.error} /> : this.props.children
  }
}
