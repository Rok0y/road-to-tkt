import { useEffect, useMemo, useState } from 'react'
import type { Entry, Program } from '../types'
import type { Stats } from '../hooks'
import { saveProgram } from '../db/db'
import { EmptyState, PageHeader } from '../components/ui'
import { direction, projectDate, weeklySummary } from '../lib/calc'
import { diffDays } from '../lib/dates'
import { fmtDate, fmtDelta, fmtKg, fmtNumber, fmtRate, parseDecimal } from '../lib/format'

interface Props {
  program: Program | null
  entries: Entry[]
  stats: Stats | null
  today: string
}

type RateKey = 'objective' | 'current' | 'overall'

const RATE_LABELS: Record<RateKey, { title: string; sub: string }> = {
  objective: { title: 'Objectif', sub: 'rythme visé' },
  current: { title: 'Actuel', sub: '14 derniers jours' },
  overall: { title: 'Général', sub: 'depuis le début' },
}

export function Plan({ program, entries, stats, today }: Props) {
  const [rateInput, setRateInput] = useState('')
  useEffect(() => {
    if (program) setRateInput(fmtNumber(program.targetRatePerWeek, 2))
  }, [program])

  const weeks = useMemo(
    () => (program ? weeklySummary(program, entries, today).reverse() : []),
    [program, entries, today],
  )

  if (!program || !stats) {
    return (
      <div className="page">
        <PageHeader eyebrow="Programme" title="Plan" />
        <div className="card">
          <EmptyState icon="🗺️" title="Aucun programme">
            <p>Configure ton programme dans l'onglet Réglages.</p>
          </EmptyState>
        </div>
      </div>
    )
  }

  const dir = direction(program)
  const objective = stats.rates.objective

  /** Couleur d'un rythme selon qu'il tient l'objectif, avance moins vite, ou recule. */
  function tone(rate: number | null): string {
    if (rate === null) return 'muted'
    const along = rate * dir
    if (along >= Math.abs(objective) - 1e-9) return 'good'
    if (along > 0) return ''
    return 'bad'
  }

  function commitRate() {
    const v = parseDecimal(rateInput)
    if (!program || v === null || v <= 0 || v > 3) {
      setRateInput(fmtNumber(program!.targetRatePerWeek, 2))
      return
    }
    if (v !== program.targetRatePerWeek) saveProgram({ ...program, targetRatePerWeek: v })
  }

  const totalWeeks = Math.ceil(diffDays(program.startDate, program.endDate) / 7)
  const currentWeek = Math.floor(diffDays(program.startDate, today) / 7) + 1

  return (
    <div className="page">
      <PageHeader eyebrow="Programme" title="Plan" />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <div>
            <div className="small muted">Du {fmtDate(program.startDate)} au {fmtDate(program.endDate)}</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>
              {fmtKg(program.startWeight)} → {fmtKg(program.targetWeight)}
            </div>
          </div>
          <div className="row-end small">
            <div className="muted">Semaine</div>
            <div style={{ fontWeight: 600 }}>
              {Math.max(0, currentWeek)} / {totalWeeks}
            </div>
          </div>
        </div>
      </div>

      <h2 className="section-title">Rythme (kg / semaine)</h2>
      <div className="list">
        <div className="field">
          <label htmlFor="target-rate">Rythme visé</label>
          <input
            id="target-rate"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={commitRate}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            style={{ fontWeight: 600, color: 'var(--blue)' }}
          />
          <span className="unit">kg/sem</span>
        </div>
      </div>
      <div className="grid-3" style={{ marginTop: 12 }}>
        {(Object.keys(RATE_LABELS) as RateKey[]).map((k) => (
          <div key={k} className="card" style={{ padding: '12px 10px', textAlign: 'center' }}>
            <div className="small" style={{ fontWeight: 600 }}>
              {RATE_LABELS[k].title}
            </div>
            <div className={`big-value ${k === 'objective' ? '' : tone(stats.rates[k])}`} style={{ fontSize: 24, margin: '4px 0 0' }}>
              {fmtRate(stats.rates[k])}
            </div>
            <div className="small muted" style={{ fontSize: 11 }}>
              {RATE_LABELS[k].sub}
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title">Projections</h2>
      <div className="list">
        {(Object.keys(RATE_LABELS) as RateKey[]).map((k) => {
          const rate = stats.rates[k]
          const nextDate = stats.next ? projectDate(stats.weight, stats.next.weight, rate, today) : null
          const goalDate = projectDate(stats.weight, program.targetWeight, rate, today)
          const late = goalDate ? diffDays(program.endDate, goalDate) : null
          return (
            <div key={k} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="row-main">
                <div style={{ fontWeight: 600 }}>Au rythme {RATE_LABELS[k].title.toLowerCase()}</div>
                <div className="row-sub">{rate === null ? 'pas assez de pesées' : `${fmtRate(rate)} kg/sem`}</div>
              </div>
              <div className="row-end small">
                {stats.next && (
                  <div>
                    <span className="muted">Palier {stats.next.index} · </span>
                    <strong>{nextDate ? fmtDate(nextDate, 'd MMM') : '—'}</strong>
                  </div>
                )}
                <div>
                  <span className="muted">Objectif · </span>
                  <strong>{goalDate ? fmtDate(goalDate, 'd MMM yyyy') : 'non atteint'}</strong>
                </div>
                {late !== null && (
                  <div className={late <= 0 ? 'good' : 'bad'}>
                    {late === 0 ? 'pile à la date de fin' : late < 0 ? `${-late} j d'avance` : `${late} j de retard`}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="section-title">Paliers</h2>
      <div className="list">
        {stats.milestones.map((m) => {
          const eta = !m.reachedOn ? projectDate(stats.weight, m.weight, stats.rates.current ?? stats.rates.overall, today) : null
          const isNext = stats.next?.index === m.index
          return (
            <div key={m.index} className="row">
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  flex: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  background: m.reachedOn ? 'var(--green)' : isNext ? 'rgba(0,122,255,0.12)' : 'var(--fill)',
                  color: m.reachedOn ? '#fff' : isNext ? 'var(--blue)' : 'var(--secondary)',
                }}
              >
                {m.reachedOn ? '✓' : m.index}
              </span>
              <div className="row-main">
                <div style={{ fontWeight: isNext ? 600 : 400 }}>
                  {m.index * 10} % · {fmtKg(m.weight)}
                </div>
              </div>
              <div className="row-end small">
                {m.reachedOn ? (
                  <span className="good">atteint le {fmtDate(m.reachedOn, 'd MMM')}</span>
                ) : (
                  <span className="muted">{eta ? `prévu ~ ${fmtDate(eta, 'd MMM yy')}` : '—'}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="section-footer">Dates prévues au rythme actuel (14 j), ou au rythme général à défaut.</p>

      <h2 className="section-title">Semaine par semaine</h2>
      {weeks.length === 0 ? (
        <div className="card small muted">Le programme n'a pas encore commencé.</div>
      ) : (
        <div className="list">
          {weeks.map((w) => (
            <div key={w.week} className="row">
              <div className="row-main">
                <div style={{ fontWeight: 600 }}>Semaine {w.week}</div>
                <div className="row-sub">
                  du {fmtDate(w.from, 'd MMM')} au {fmtDate(w.to, 'd MMM')}
                </div>
              </div>
              <div className="row-end">
                <div style={{ fontWeight: 600 }}>{w.weight !== null ? fmtKg(w.weight) : '—'}</div>
                {w.delta !== null && (
                  <div className={`small ${w.delta * dir > 0 ? 'good' : w.delta * dir < 0 ? 'bad' : 'muted'}`}>
                    {fmtDelta(w.delta, 2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="section-footer">Poids = dernière pesée de la semaine · écart vs semaine précédente (S1 vs poids de départ).</p>
    </div>
  )
}
