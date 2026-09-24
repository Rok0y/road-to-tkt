import { useState } from 'react'
import type { Entry, Program } from '../types'
import type { Stats } from '../hooks'
import { Gauge } from '../components/Gauge'
import { EmptyState, PageHeader } from '../components/ui'
import { bmi, bmiCategory, projectDate, weightForBmi } from '../lib/calc'
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

export function Home({ program, entries, stats, photoDates, today, onAdd, onEdit, onSetup, onDemo }: Props) {
  const [showAll, setShowAll] = useState(false)
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

      <div className="card" style={{ paddingTop: 20 }}>
        <Gauge weight={stats.weight} progress={stats.progress} reached={stats.reached} />
        <div className="grid-3" style={{ marginTop: 14, textAlign: 'center' }}>
          <Mini label="Départ" value={fmtKg(program.startWeight)} />
          <Mini label={lost <= 0 ? 'Perdu' : 'Pris'} value={fmtDelta(lost)} tone={lost * (program.targetWeight - program.startWeight) > 0 ? 'good' : lost === 0 ? undefined : 'bad'} />
          <Mini label="Reste" value={fmtKg(Math.abs(remaining))} />
        </div>
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

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <div className="small muted">{label}</div>
      <div className={`num ${tone ?? ''}`} style={{ fontWeight: 600 }}>
        {value}
      </div>
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
    <div style={{ position: 'relative', marginTop: 10, height: 12 }}>
      <div style={{ display: 'flex', gap: 2, height: 6, marginTop: 3 }}>
        {bands.map((b) => {
          const w = pct(b.to) - pct(from)
          from = b.to
          return <div key={b.to} style={{ width: `${w}%`, background: b.c, borderRadius: 3, opacity: 0.85 }} />
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: `calc(${pct(value)}% - 6px)`,
          width: 12,
          height: 12,
          borderRadius: 6,
          background: '#fff',
          border: '2.5px solid var(--label)',
        }}
      />
    </div>
  )
}
