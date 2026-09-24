import { useMemo, useState } from 'react'
import type { Entry, Program } from '../types'
import type { Stats } from '../hooks'
import { WeightChart } from '../components/WeightChart'
import { EmptyState, PageHeader, Segmented } from '../components/ui'
import { aggregate, type Granularity } from '../lib/calc'
import { capitalize, fmtDate, fmtDelta, fmtKg } from '../lib/format'

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
]

const PERIOD_LABEL: Record<Granularity, (iso: string) => string> = {
  day: (d) => fmtDate(d, 'EEE d MMM'),
  week: (d) => `Sem. du ${fmtDate(d, 'd MMM')}`,
  month: (d) => fmtDate(d, 'MMMM yyyy'),
  year: (d) => d.slice(0, 4),
}

function loadGranularity(): Granularity {
  try {
    const v = localStorage.getItem('chart-granularity')
    if (v && OPTIONS.some((o) => o.value === v)) return v as Granularity
  } catch {
    /* stockage indisponible */
  }
  return 'day'
}

interface Props {
  program: Program | null
  entries: Entry[]
  stats: Stats | null
  today: string
}

export function ChartPage({ program, entries, stats, today }: Props) {
  const [granularity, setGranularity] = useState<Granularity>(loadGranularity)
  const change = (g: Granularity) => {
    setGranularity(g)
    try {
      localStorage.setItem('chart-granularity', g)
    } catch {
      /* ignore */
    }
  }

  // Vue tableau : dernière pesée de chaque période, la plus récente en premier.
  const table = useMemo(() => {
    const pts = aggregate(entries, granularity)
    return pts
      .map((p, i) => ({ ...p, delta: i > 0 ? p.y - pts[i - 1].y : null }))
      .reverse()
      .slice(0, 12)
  }, [entries, granularity])

  return (
    <div className="page">
      <PageHeader eyebrow="Évolution" title="Graphique" />
      <Segmented value={granularity} options={OPTIONS} onChange={change} />
      {!program || !stats || entries.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <EmptyState icon="📈" title="Pas encore de données">
            <p>Ajoute quelques pesées pour voir ta courbe.</p>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginTop: 12, padding: '14px 10px 8px' }}>
            <WeightChart
              program={program}
              entries={entries}
              milestones={stats.milestones}
              granularity={granularity}
              today={today}
            />
          </div>
          <p className="section-footer">
            {granularity === 'day'
              ? 'Points : pesées du jour · courbe : poids le plus bas sur 7 jours · pointillés : plan et paliers.'
              : 'Dernière pesée de chaque période · pointillés : plan et paliers.'}
          </p>

          <h2 className="section-title">Détail</h2>
          <div className="list">
            {table.map((p) => (
              <div key={p.x} className="row">
                <div className="row-main">
                  {capitalize(PERIOD_LABEL[granularity](p.x))}
                </div>
                <div className="row-end">
                  <span style={{ fontWeight: 600 }}>{fmtKg(p.y)}</span>
                  {p.delta !== null && (
                    <span className={`small ${p.delta < 0 ? 'good' : p.delta > 0 ? 'bad' : 'muted'}`} style={{ marginLeft: 10 }}>
                      {fmtDelta(p.delta)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
