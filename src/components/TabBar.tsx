export type Tab = 'home' | 'chart' | 'plan' | 'photos' | 'settings'

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const ICONS: Record<Tab, React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4.5 16.5a8 8 0 1 1 15 0" />
      <path d="M12 12.5l3.5-3.5" />
      <circle cx="12" cy="13" r="1.3" fill="currentColor" />
      <path d="M4 19.5h16" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 4v16h16" />
      <path d="M7.5 9l3.5 3.5 3-2.5 4.5 5" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M5 21V4" />
      <path d="M5 4.5h12l-2.5 3.5 2.5 3.5H5" />
    </svg>
  ),
  photos: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="6.5" width="18" height="13" rx="3" />
      <path d="M8.5 6.5l1.2-2h4.6l1.2 2" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  ),
}

const LABELS: Record<Tab, string> = {
  home: 'Accueil',
  chart: 'Graphique',
  plan: 'Plan',
  photos: 'Photos',
  settings: 'Réglages',
}

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar">
      <div className="tabbar-inner">
        {(Object.keys(LABELS) as Tab[]).map((t) => (
          <button key={t} aria-current={t === tab ? 'page' : undefined} onClick={() => onChange(t)}>
            {ICONS[t]}
            {LABELS[t]}
          </button>
        ))}
      </div>
    </nav>
  )
}
