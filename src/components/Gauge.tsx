import { fmtNumber } from '../lib/format'

interface Props {
  weight: number
  progress: number // 0..1
  reached: number // paliers atteints
}

const SIZE = 260
const STROKE = 22
const R = (SIZE - STROKE) / 2
const SWEEP = 270 // arc ouvert en bas, façon compteur

function polar(angleDeg: number, r = R) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [SIZE / 2 + r * Math.cos(a), SIZE / 2 + r * Math.sin(a)]
}

function arcPath(from: number, to: number) {
  const [x1, y1] = polar(from)
  const [x2, y2] = polar(to)
  const large = to - from > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`
}

/** Compteur : arc de progression vers l'objectif, avec une graduation par palier (10 %). */
export function Gauge({ weight, progress, reached }: Props) {
  const start = -SWEEP / 2
  const end = start + SWEEP * Math.max(0.001, progress)
  return (
    <div style={{ position: 'relative', width: SIZE, maxWidth: '100%', margin: '0 auto' }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label={`Progression ${Math.round(progress * 100)} %`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#30d158" />
            <stop offset="100%" stopColor="#00b4a0" />
          </linearGradient>
        </defs>
        <path d={arcPath(start, start + SWEEP)} fill="none" stroke="var(--fill)" strokeWidth={STROKE} strokeLinecap="round" />
        <path d={arcPath(start, end)} fill="none" stroke="url(#gauge-grad)" strokeWidth={STROKE} strokeLinecap="round" />
        {Array.from({ length: 9 }, (_, i) => {
          const angle = start + (SWEEP * (i + 1)) / 10
          const [x1, y1] = polar(angle, R - STROKE / 2 + 3)
          const [x2, y2] = polar(angle, R + STROKE / 2 - 3)
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i < reached ? 'rgba(255,255,255,0.85)' : 'rgba(60,60,67,0.18)'}
              strokeWidth={2}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 8,
        }}
      >
        <span className="small muted" style={{ fontWeight: 600 }}>
          Poids · min 7 j
        </span>
        <span className="num" style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          {fmtNumber(weight)}
        </span>
        <span className="muted" style={{ fontWeight: 600 }}>
          kg
        </span>
      </div>
      <div
        className="small"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 6, textAlign: 'center', fontWeight: 600 }}
      >
        <span className="good">{Math.round(progress * 100)} %</span>
        <span className="muted"> · Palier {reached}/10</span>
      </div>
    </div>
  )
}
