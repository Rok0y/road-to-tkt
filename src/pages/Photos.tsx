import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allPhotos } from '../db/db'
import { useBlobUrl } from '../hooks'
import { EmptyState, PageHeader, Segmented } from '../components/ui'
import { capitalize, fmtDate, fmtDelta, fmtKg } from '../lib/format'
import { diffDays } from '../lib/dates'
import { POSES, POSE_LABELS, type Entry, type Photo, type Pose } from '../types'

type Mode = 'side' | 'slider'

export function Photos({ entries }: { entries: Entry[] }) {
  const photos = useLiveQuery(allPhotos, [])
  const [pose, setPose] = useState<Pose>('front')
  const [mode, setMode] = useState<Mode>('side')
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [viewer, setViewer] = useState<Photo | null>(null)

  const dates = useMemo(() => [...new Set((photos ?? []).map((p) => p.date))], [photos])
  const weightOn = useMemo(() => new Map(entries.map((e) => [e.date, e.weight])), [entries])
  const find = (date: string | null, p: Pose) => photos?.find((x) => x.date === date && x.pose === p)

  // Par défaut : première et dernière date avec photo ; on corrige si une date disparaît.
  useEffect(() => {
    if (!dates.length) return
    if (!before || !dates.includes(before)) setBefore(dates[0])
    if (!after || !dates.includes(after)) setAfter(dates[dates.length - 1])
  }, [dates, before, after])

  if (photos === undefined) return <div className="page" />

  if (!photos.length) {
    return (
      <div className="page">
        <PageHeader eyebrow="Progression" title="Photos" />
        <div className="card">
          <EmptyState icon="📸" title="Aucune photo">
            <p>Ajoute des photos de face, de profil et de dos en enregistrant une pesée.</p>
          </EmptyState>
        </div>
      </div>
    )
  }

  const wBefore = before ? weightOn.get(before) : undefined
  const wAfter = after ? weightOn.get(after) : undefined
  const beforePhoto = find(before, pose)
  const afterPhoto = find(after, pose)

  return (
    <div className="page">
      <PageHeader eyebrow="Progression" title="Avant / Après" />

      <Segmented value={pose} options={POSES.map((p) => ({ value: p, label: POSE_LABELS[p] }))} onChange={setPose} />

      <div className="list" style={{ marginTop: 12 }}>
        <DateField id="before" label="Avant" value={before} dates={dates} onChange={setBefore} />
        <DateField id="after" label="Après" value={after} dates={dates} onChange={setAfter} />
      </div>

      <div className="card" style={{ marginTop: 12, padding: 12 }}>
        {mode === 'side' ? (
          <div className="grid-2" style={{ gap: 8 }}>
            <Frame photo={beforePhoto} label={before ? fmtDate(before, 'd MMM yyyy') : ''} weight={wBefore} onOpen={setViewer} />
            <Frame photo={afterPhoto} label={after ? fmtDate(after, 'd MMM yyyy') : ''} weight={wAfter} onOpen={setViewer} />
          </div>
        ) : (
          <Slider before={beforePhoto} after={afterPhoto} />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12 }}>
          <div className="small">
            {wBefore !== undefined && wAfter !== undefined ? (
              <>
                <strong className={wAfter < wBefore ? 'good' : wAfter > wBefore ? 'bad' : ''}>{fmtDelta(wAfter - wBefore)}</strong>
                <span className="muted"> en {before && after ? Math.abs(diffDays(before, after)) : 0} jours</span>
              </>
            ) : (
              <span className="muted">Pas de pesée à l'une de ces dates</span>
            )}
          </div>
          <div style={{ width: 170 }}>
            <Segmented
              value={mode}
              options={[
                { value: 'side', label: 'Côte à côte' },
                { value: 'slider', label: 'Curseur' },
              ]}
              onChange={setMode}
            />
          </div>
        </div>
      </div>

      <h2 className="section-title">Galerie</h2>
      <div className="list">
        {[...dates].reverse().map((d) => (
          <div key={d} className="row" style={{ alignItems: 'center' }}>
            <div className="row-main">
              <div style={{ fontWeight: 600 }}>{capitalize(fmtDate(d, 'EEE d MMM yyyy'))}</div>
              {weightOn.has(d) && <div className="row-sub">{fmtKg(weightOn.get(d)!)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {POSES.map((p) => (
                <Thumb key={p} photo={find(d, p)} onOpen={setViewer} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {viewer && <Viewer photo={viewer} weight={weightOn.get(viewer.date)} onClose={() => setViewer(null)} />}
    </div>
  )
}

function DateField({
  id,
  label,
  value,
  dates,
  onChange,
}: {
  id: string
  label: string
  value: string | null
  dates: string[]
  onChange: (d: string) => void
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ color: 'var(--blue)' }}>
        {dates.map((d) => (
          <option key={d} value={d}>
            {fmtDate(d, 'd MMM yyyy')}
          </option>
        ))}
      </select>
    </div>
  )
}

function Frame({
  photo,
  label,
  weight,
  onOpen,
}: {
  photo?: Photo
  label: string
  weight?: number
  onOpen: (p: Photo) => void
}) {
  const url = useBlobUrl(photo?.blob)
  return (
    <div>
      <button
        className={`photo-slot${url ? ' filled' : ''}`}
        style={{ width: '100%' }}
        onClick={() => photo && onOpen(photo)}
        disabled={!photo}
      >
        {url ? <img src={url} alt={label} /> : <span>Pas de photo</span>}
      </button>
      <div className="small" style={{ marginTop: 6, textAlign: 'center' }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="muted">{weight !== undefined ? fmtKg(weight) : '—'}</div>
      </div>
    </div>
  )
}

/** Superposition avant/après : on fait glisser la séparation. */
function Slider({ before, after }: { before?: Photo; after?: Photo }) {
  const [pos, setPos] = useState(50)
  const beforeUrl = useBlobUrl(before?.blob)
  const afterUrl = useBlobUrl(after?.blob)
  if (!beforeUrl || !afterUrl) {
    return (
      <div className="photo-slot" style={{ width: '100%' }}>
        Il faut une photo à chacune des deux dates.
      </div>
    )
  }
  const img: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
  const moveTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
  }
  return (
    <div
      style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 12, overflow: 'hidden', touchAction: 'pan-y', cursor: 'ew-resize', userSelect: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        moveTo(e)
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && moveTo(e)}
    >
      <img src={afterUrl} alt="Après" style={img} />
      <img src={beforeUrl} alt="Avant" style={{ ...img, clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, marginLeft: -1, background: '#fff', boxShadow: '0 0 6px rgba(0,0,0,0.4)' }} />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: `${pos}%`,
          width: 36,
          height: 36,
          margin: '-18px 0 0 -18px',
          borderRadius: 18,
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          color: 'var(--secondary)',
          pointerEvents: 'none',
        }}
      >
        ⇆
      </div>
      <span className="tag" style={tagStyle('left')}>Avant</span>
      <span className="tag" style={tagStyle('right')}>Après</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Position du curseur avant/après"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

function tagStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: 8,
    [side]: 8,
    padding: '2px 8px',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
  }
}

function Thumb({ photo, onOpen }: { photo?: Photo; onOpen: (p: Photo) => void }) {
  const url = useBlobUrl(photo?.thumb)
  return (
    <button
      onClick={() => photo && onOpen(photo)}
      disabled={!photo}
      style={{ width: 44, height: 58, borderRadius: 8, overflow: 'hidden', background: 'var(--fill)', flex: 'none' }}
    >
      {url && <img src={url} alt={photo ? POSE_LABELS[photo.pose] : ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </button>
  )
}

function Viewer({ photo, weight, onClose }: { photo: Photo; weight?: number; onClose: () => void }) {
  const url = useBlobUrl(photo.blob)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(var(--safe-top) + 16px) 16px calc(var(--safe-bottom) + 16px)',
        color: '#fff',
      }}
    >
      {url && <img src={url} alt={POSE_LABELS[photo.pose]} style={{ maxWidth: '100%', maxHeight: '82dvh', borderRadius: 12 }} />}
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <strong>{POSE_LABELS[photo.pose]}</strong> · {fmtDate(photo.date, 'd MMMM yyyy')}
        {weight !== undefined && ` · ${fmtKg(weight)}`}
      </div>
      <div className="small" style={{ opacity: 0.6, marginTop: 4 }}>
        Touchez pour fermer
      </div>
    </div>
  )
}
