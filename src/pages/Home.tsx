import { useState } from 'react'
import type { Entry, Program } from '../types'
import type { Stats } from '../hooks'
import { Gauge } from '../components/Gauge'
import { EmptyState, PageHeader, Segmented } from '../components/ui'
import { WeightChart } from '../components/WeightChart'
import { bmi, bmiCategory, projectDate, weightForBmi, type Granularity } from '../lib/calc'
import { capitalize, fmtDate, fmtDelta, fmtKg, fmtNumber } from '../lib/format'

interface Props {
  program: Program | null
  entries: Entry[]
  stats: Stats | null
  photoDates: Set<string>
  today: string
  onAdd: () => void
  onEdit: (e: Entry) => void
  onSetup: () => void
  onDemo: () => void
}

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
]

function loadGranularity(): Granularity {
  try {
    const v = localStorage.getItem('chart-granularity')
    if (v && GRANULARITIES.some((o) => o.value === v)) return v as Granularity
  } catch {
    /* stockage indisponible */
  }
  return 'day'
}

export function Home({ program, entries, stats, photoDates, today, onAdd, onEdit, onSetup, onDemo }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [granularity, setGranularity] = useState<Granularity>(loadGranularity)
  const changeGranularity = (g: Granularity) => {
    setGranularity(g)
    try {
      localStorage.setItem('chart-granularity', g)
    } catch {
      /* ignore */
    }
  }
  const todayEntry = entries.find((e) => e.date === today)

  const header = (
    <PageHeader
      eyebrow={fmtDate(today, 'EEEE d MMMM')}
      title="Road to TKT"
      action={
        program && (
          <button className="icon-btn" aria-label="Ajouter une pesée" onClick={onAdd}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )
      }
    />
  )

  if (!program || !stats) {
    return (
      <div className="page">
        {header}
        <div className="card">
          <EmptyState icon="🎯" title="Bienvenue !">
            <p>Commence par définir ton programme : taille, dates, poids de départ et objectif.</p>
            <button className="btn" onClick={onSetup}>
              Configurer mon programme
            </button>
            <button className="btn secondary" style={{ marginTop: 10 }} onClick={onDemo}>
              Essayer avec des données de démo
            </button>
          </EmptyState>
        </div>
      </div>
    )
  }

  const value = bmi(stats.weight, program.heightCm)
  const cat = bmiCategory(value)
  const lost = stats.weight - program.startWeight
  const remaining = program.targetWeight - stats.weight
  const nextRate = stats.rates.current ?? stats.rates.overall
  const nextDate = stats.next ? projectDate(stats.weight, stats.next.weight, nextRate, today) : null
  const history = [...entries].reverse()
  const shown = showAll ? history : history.slice(0, 20)

  return (
    <div className="page">
      {header}

      {/* Jauge au centre, repères aux quatre coins (le cercle laisse les coins libres). */}
      <div className="card" style={{ position: 'relative', padding: '18px 14px 14px' }}>
        <Gauge weight={stats.weight} progress={stats.progress} reached={stats.reached} />
        <Corner at="top-left" label="Départ 🚀" value={fmtKg(program.startWeight)} sub={fmtDate(program.startDate, 'd MMM yyyy')} />
        <Corner at="top-right" label="🏆 Objectif" value={fmtKg(program.targetWeight)} sub={fmtDate(program.endDate, 'd MMM yyyy')} />
        <Corner
          at="bottom-left"
          label={lost <= 0 ? 'Perdu' : 'Pris'}
          value={fmtDelta(lost)}
          tone={lost * (program.targetWeight - program.startWeight) > 0 ? 'good' : lost === 0 ? undefined : 'bad'}
        />
        <Corner at="bottom-right" label="Reste" value={fmtKg(Math.abs(remaining))} />
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div className="card">
          <p className="card-title">IMC</p>
          <div className="big-value">{fmtNumber(value)}</div>
          <div className="small" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: cat.color, flex: 'none' }} />
            {cat.label}
          </div>
          <BmiBar value={value} />
          {value >= 25 && (
            <div className="small muted" style={{ marginTop: 6 }}>
              IMC 25 à {fmtKg(weightForBmi(25, program.heightCm))}
            </div>
          )}
        </div>
        <div className="card">
          <p className="card-title">Prochain palier</p>
          {stats.next ? (
            <>
              <div className="big-value">
                {fmtNumber(stats.next.weight)}
                <small>kg</small>
              </div>
              <div className="small">
                encore <strong>{fmtKg(Math.abs(stats.weight - stats.next.weight))}</strong>
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {nextDate ? `Estimé le ${fmtDate(nextDate, 'd MMM')}` : 'Date estimée : rythme insuffisant'}
              </div>
            </>
          ) : (
            <>
              <div className="big-value">🏆</div>
              <div className="small good">Objectif atteint !</div>
            </>
          )}
        </div>
      </div>

      <button className="btn" style={{ marginTop: 16 }} onClick={() => (todayEntry ? onEdit(todayEntry) : onAdd())}>
        {todayEntry ? `Pesée du jour : ${fmtKg(todayEntry.weight)} · Modifier` : '＋ Ajouter la pesée du jour'}
      </button>

      {entries.length > 0 && (
        <>
          <h2 className="section-title">Évolution</h2>
          <Segmented value={granularity} options={GRANULARITIES} onChange={changeGranularity} />
          <div className="card" style={{ marginTop: 10, padding: '14px 10px 8px' }}>
            <WeightChart
              program={program}
              entries={entries}
              milestones={stats.milestones}
              granularity={granularity}
              today={today}
            />
          </div>
        </>
      )}

      <h2 className="section-title">Historique</h2>
      {history.length === 0 ? (
        <div className="card muted small" style={{ textAlign: 'center' }}>
          Aucune pesée pour l'instant.
        </div>
      ) : (
        <div className="list">
          {shown.map((e) => {
            const i = entries.indexOf(e)
            const prev = i > 0 ? entries[i - 1] : null
            const delta = prev ? e.weight - prev.weight : null
            return (
              <button key={e.date} className="row" onClick={() => onEdit(e)}>
                <div className="row-main">
                  <div>{capitalize(fmtDate(e.date, 'EEE d MMM yyyy'))}</div>
                  {photoDates.has(e.date) && <div className="row-sub">📷 Photos</div>}
                </div>
                <div className="row-end">
                  <div style={{ fontWeight: 600 }}>{fmtKg(e.weight)}</div>
                  {delta !== null && (
                    <div className={`small ${delta < 0 ? 'good' : delta > 0 ? 'bad' : 'muted'}`}>{fmtDelta(delta)}</div>
                  )}
                </div>
                <span className="chevron">›</span>
              </button>
            )
          })}
        </div>
      )}
      {!showAll && history.length > shown.length && (
        <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => setShowAll(true)}>
          Tout afficher ({history.length})
        </button>
      )}
    </div>
  )
}

type CornerPos = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

function Corner({ at, label, value, sub, tone }: { at: CornerPos; label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  const [v, h] = at.split('-') as ['top' | 'bottom', 'left' | 'right']
  return (
    <div style={{ position: 'absolute', [v]: 14, [h]: 16, textAlign: h }}>
      <div className="small muted">{label}</div>
      <div className={`num ${tone ?? ''}`} style={{ fontWeight: 700, fontSize: 17 }}>
        {value}
      </div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  )
}

/** Échelle IMC 16 → 42 avec les seuils OMS et un repère sur la valeur actuelle. */
function BmiBar({ value }: { value: number }) {
  const min = 16
  const max = 42
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100
  const bands = [
    { to: 18.5, c: '#5ac8fa' },
    { to: 25, c: '#34c759' },
    { to: 30, c: '#ffcc00' },
    { to: 35, c: '#ff9500' },
    { to: 40, c: '#ff6b3d' },
    { to: max, c: '#ff3b30' },
  ]
  let from = min
  return (
    <div style={{ position: 'relative', marginTop: 12, height: 16 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2, height: 6 }}>
        {bands.map((b) => {
          const w = pct(b.to) - pct(from)
          from = b.to
          return <div key={b.to} style={{ width: `${w}%`, background: b.c, borderRadius: 3, opacity: 0.85 }} />
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: `${pct(value)}%`,
          width: 16,
          height: 16,
          transform: 'translate(-50%, -50%)',
          borderRadius: 8,
          background: '#fff',
          border: '3px solid var(--label)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </div>
  )
}
