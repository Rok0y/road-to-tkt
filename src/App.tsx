import { useCallback, useEffect, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { EntrySheet } from './components/EntrySheet'
import { useEntries, usePhotoDates, useProgram, useStats, useToday } from './hooks'
import { loadDemoData } from './db/demo'
import { Home } from './pages/Home'
import { ChartPage } from './pages/ChartPage'
import { Plan } from './pages/Plan'
import { Photos } from './pages/Photos'
import { Settings } from './pages/Settings'
import type { Entry } from './types'

const TABS: Tab[] = ['home', 'chart', 'plan', 'photos', 'settings']

function initialTab(): Tab {
  try {
    const t = sessionStorage.getItem('tab') as Tab | null
    if (t && TABS.includes(t)) return t
  } catch {
    /* stockage indisponible */
  }
  return 'home'
}

export default function App() {
  const program = useProgram()
  const entries = useEntries()
  const photoDates = usePhotoDates()
  const today = useToday()
  const stats = useStats(program, entries, today)

  const [tab, setTabState] = useState<Tab>(initialTab)
  const [sheet, setSheet] = useState<{ entry?: Entry } | null>(null)

  const setTab = (t: Tab) => {
    setTabState(t)
    try {
      sessionStorage.setItem('tab', t)
    } catch {
      /* ignore */
    }
  }
  // Chaque onglet s'ouvre en haut de page, une fois le nouvel écran affiché.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const closeSheet = useCallback(() => setSheet(null), [])
  const demo = useCallback(async () => {
    try {
      await loadDemoData()
      setTab('home')
    } catch (err) {
      alert(`Impossible de charger la démo : ${(err as Error).message}`)
    }
  }, [])

  // Chargement initial d'IndexedDB (quelques ms) : on évite un flash de l'écran d'accueil vide.
  if (program === undefined || entries === undefined) return null

  return (
    <>
      {tab === 'home' && (
        <Home
          program={program}
          entries={entries}
          stats={stats}
          photoDates={photoDates}
          today={today}
          onAdd={() => setSheet({})}
          onEdit={(entry) => setSheet({ entry })}
          onSetup={() => setTab('settings')}
          onDemo={demo}
        />
      )}
      {tab === 'chart' && <ChartPage program={program} entries={entries} stats={stats} today={today} />}
      {tab === 'plan' && <Plan program={program} entries={entries} stats={stats} today={today} />}
      {tab === 'photos' && <Photos entries={entries} />}
      {tab === 'settings' && <Settings program={program} entryCount={entries.length} onDemo={demo} />}

      <TabBar tab={tab} onChange={setTab} />

      {sheet && (
        <EntrySheet
          key={sheet.entry?.date ?? 'new'}
          entry={sheet.entry}
          lastWeight={entries[entries.length - 1]?.weight}
          onClose={closeSheet}
        />
      )}
    </>
  )
}
