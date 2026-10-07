import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allPhotos, updatePhotoImages } from '../db/db'
import { useBlobUrl, useImageRatio } from '../hooks'
import { CropEditor } from '../components/CropEditor'
import { cropPhoto, isFullCrop } from '../lib/images'
import { EmptyState, PageHeader, Segmented } from '../components/ui'
import { capitalize, fmtDate, fmtDelta, fmtKg } from '../lib/format'
import { diffDays } from '../lib/dates'
import { POSES, POSE_LABELS, type Crop, type Entry, type Photo, type Pose } from '../types'

type Mode = 'side' | 'slider'

const MODES: { value: Mode; label: string }[] = [
  { value: 'side', label: 'Côte à côte' },
  { value: 'slider', label: 'Curseur' },
]

/**
 * Format commun aux deux photos comparées : celui de la photo « après » (la plus récente,
 * a priori recadrée comme les suivantes), borné pour rester lisible.
 */
function useFrameRatio(before?: Photo, after?: Photo): number {
  const b = useImageRatio(before?.blob)
  const a = useImageRatio(after?.blob)
  return Math.min(1, Math.max(0.4, a ?? b ?? 3 / 4))
}

export function Photos({ entries }: { entries: Entry[] }) {
  const photos = useLiveQuery(allPhotos, [])
  const [pose, setPose] = useState<Pose>('front')
  const [mode, setMode] = useState<Mode>('side')
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [viewerId, setViewerId] = useState<number | null>(null)
  const [compare, setCompare] = useState(false)

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
  // Lue dans la base à chaque rendu : la visionneuse suit un recadrage.
  const viewer = photos.find((p) => p.id === viewerId)
  const openViewer = (p: Photo) => setViewerId(p.id ?? null)

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
  const beforeLabel = before ? fmtDate(before, 'd MMM yyyy') : ''
  const afterLabel = after ? fmtDate(after, 'd MMM yyyy') : ''
  const summary =
    wBefore !== undefined && wAfter !== undefined ? (
      <>
        <strong className={wAfter < wBefore ? 'good' : wAfter > wBefore ? 'bad' : ''}>{fmtDelta(wAfter - wBefore)}</strong>
        <span style={{ opacity: 0.6 }}> en {before && after ? Math.abs(diffDays(before, after)) : 0} jours</span>
      </>
    ) : (
      <span style={{ opacity: 0.6 }}>Pas de pesée à l'une de ces dates</span>
    )

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
          <SideBySide
            before={{ photo: beforePhoto, label: beforeLabel, weight: wBefore }}
            after={{ photo: afterPhoto, label: afterLabel, weight: wAfter }}
            onOpen={() => setCompare(true)}
          />
        ) : (
          <Slider before={beforePhoto} after={afterPhoto} />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 12 }}>
          <div className="small">{summary}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="icon-btn"
              aria-label="Comparer en plein écran"
              onClick={() => setCompare(true)}
              disabled={!beforePhoto && !afterPhoto}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
            <div style={{ width: 170 }}>
              <Segmented value={mode} options={MODES} onChange={setMode} />
            </div>
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
                <Thumb key={p} photo={find(d, p)} onOpen={openViewer} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {viewer && <Viewer photo={viewer} weight={weightOn.get(viewer.date)} onClose={() => setViewerId(null)} />}
      {compare && (
        <CompareViewer
          pose={pose}
          before={{ photo: beforePhoto, label: beforeLabel, weight: wBefore }}
          after={{ photo: afterPhoto, label: afterLabel, weight: wAfter }}
          summary={summary}
          mode={mode}
          onMode={setMode}
          onClose={() => setCompare(false)}
        />
      )}
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

function SideBySide({ before, after, onOpen }: { before: Side; after: Side; onOpen: () => void }) {
  const ratio = useFrameRatio(before.photo, after.photo)
  return (
    <div className="grid-2" style={{ gap: 8 }}>
      <Frame side={before} ratio={ratio} onOpen={onOpen} />
      <Frame side={after} ratio={ratio} onOpen={onOpen} />
    </div>
  )
}

/** Cadre au format des photos recadrées : le corps occupe toute la hauteur disponible. */
function Frame({ side, ratio, onOpen }: { side: Side; ratio: number; onOpen: () => void }) {
  const { photo, label, weight } = side
  const url = useBlobUrl(photo?.blob)
  return (
    <div>
      <button
        className={`photo-slot${url ? ' filled' : ''}`}
        style={{ width: '100%', aspectRatio: String(ratio), background: url ? 'var(--fill)' : undefined }}
        onClick={onOpen}
        disabled={!photo}
      >
        {url ? <img src={url} alt={label} style={{ objectFit: 'contain' }} /> : <span>Pas de photo</span>}
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
  const ratio = useFrameRatio(before, after)
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
      style={{ position: 'relative', aspectRatio: String(ratio), borderRadius: 12, overflow: 'hidden', touchAction: 'pan-y', cursor: 'ew-resize', userSelect: 'none' }}
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

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}

function Viewer({ photo, weight, onClose }: { photo: Photo; weight?: number; onClose: () => void }) {
  const url = useBlobUrl(photo.blob)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  useEscape(editing ? () => {} : onClose)

  /** Nouveau recadrage, toujours taillé dans la photo entière (jamais dans une photo déjà recadrée). */
  async function applyCrop(crop: Crop) {
    setEditing(false)
    const source = photo.original ?? photo.blob
    if (!photo.original && isFullCrop(crop)) return // déjà entière
    setBusy(true)
    try {
      const images = await cropPhoto(source, crop)
      await updatePhotoImages(photo.id!, isFullCrop(crop) ? images : { ...images, original: source, crop })
    } catch (err) {
      alert(`Recadrage impossible : ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

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
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          className="small"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
          style={{ padding: '7px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 600 }}
        >
          {busy ? 'Recadrage…' : 'Recadrer'}
        </button>
      </div>
      <div className="small" style={{ opacity: 0.6, marginTop: 8 }}>
        Touchez ailleurs pour fermer
      </div>
      {editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <CropEditor
            source={photo.original ?? photo.blob}
            initial={photo.original ? photo.crop : undefined}
            onCancel={() => setEditing(false)}
            onConfirm={applyCrop}
          />
        </div>
      )}
    </div>
  )
}

// ---------- Comparaison plein écran ----------

interface Side {
  photo?: Photo
  label: string
  weight?: number
}

/** Les deux photos en plein écran : côte à côte avec zoom synchronisé, ou curseur en grand. */
function CompareViewer({
  pose,
  before,
  after,
  summary,
  mode,
  onMode,
  onClose,
}: {
  pose: Pose
  before: Side
  after: Side
  summary: React.ReactNode
  mode: Mode
  onMode: (m: Mode) => void
  onClose: () => void
}) {
  useEscape(onClose)
  const ratio = useFrameRatio(before.photo, after.photo)
  const zoom = useZoomPan()
  const { reset } = zoom
  useEffect(reset, [mode, reset])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comparaison avant / après"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: '#000',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: 'calc(var(--safe-top) + 8px) 12px calc(var(--safe-bottom) + 12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>{POSE_LABELS[pose]}</strong>
        <button
          aria-label="Fermer"
          onClick={onClose}
          style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 15, fontWeight: 600 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {mode === 'side' ? (
          <div
            {...zoom.handlers}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, width: '100%', height: '100%', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
          >
            <ZoomPane side={before} ratio={ratio} boxRef={zoom.boxRef(0)} style={zoom.style} />
            <ZoomPane side={after} ratio={ratio} boxRef={zoom.boxRef(1)} style={zoom.style} />
          </div>
        ) : (
          // Le curseur garde le format des photos et prend toute la place disponible.
          <div style={{ width: `min(100%, calc((100dvh - var(--safe-top) - var(--safe-bottom) - 150px) * ${ratio}))` }}>
            <Slider before={before.photo} after={after.photo} />
          </div>
        )}
      </div>

      <div className="small" style={{ textAlign: 'center', marginTop: 10 }}>
        {summary}
        {mode === 'side' && <span style={{ opacity: 0.55 }}> · pince ou touche deux fois pour zoomer</span>}
      </div>
      <div style={{ width: '100%', maxWidth: 280, margin: '8px auto 0' }}>
        <Segmented value={mode} options={MODES} onChange={onMode} className="on-dark" />
      </div>
    </div>
  )
}

function ZoomPane({
  side,
  ratio,
  boxRef,
  style,
}: {
  side: Side
  ratio: number
  boxRef: (el: HTMLDivElement | null) => void
  style: React.CSSProperties
}) {
  const url = useBlobUrl(side.photo?.blob)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, minWidth: 0 }}>
      {/* Cadre au format des photos : pas de bandes noires dans lesquelles se perdre en zoomant. */}
      <div
        ref={boxRef}
        style={{ width: '100%', aspectRatio: String(ratio), maxHeight: 'calc(100% - 44px)', position: 'relative', overflow: 'hidden', borderRadius: 10, background: '#111' }}
      >
        {url ? (
          <img
            src={url}
            alt={side.label}
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', ...style }}
          />
        ) : (
          <div className="small" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 0.6 }}>
            Pas de photo
          </div>
        )}
      </div>
      <div className="small" style={{ marginTop: 6, textAlign: 'center' }}>
        <div style={{ fontWeight: 600 }}>{side.label}</div>
        <div style={{ opacity: 0.6 }}>{side.weight !== undefined ? fmtKg(side.weight) : '—'}</div>
      </div>
    </div>
  )
}

interface Zoom {
  s: number
  x: number // décalage (px) du centre de la photo
  y: number
}

type XY = { x: number; y: number }

const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 }
const MAX_ZOOM = 5

/**
 * Zoom et déplacement partagés par les deux photos : pincer, glisser, double-toucher.
 * Les deux cadres ont la même taille, donc la même transformation montre la même zone du corps.
 */
function useZoomPan() {
  const [zoom, setZoomState] = useState<Zoom>(NO_ZOOM)
  const [smooth, setSmooth] = useState(false)
  const current = useRef(zoom)
  const boxes = useRef<(HTMLDivElement | null)[]>([])
  const g = useRef({
    pointers: new Map<number, XY>(),
    start: NO_ZOOM,
    mid: { x: 0, y: 0 },
    dist: 0,
    rect: null as DOMRect | null,
    moved: false,
    lastTap: { at: 0, x: 0, y: 0 },
  })

  const setZoom = (z: Zoom) => {
    current.current = z
    setZoomState(z)
  }

  /** Bornes : pas de dézoom sous ×1, et la photo ne quitte jamais son cadre. */
  const clamp = (z: Zoom, r: DOMRect): Zoom => {
    const s = Math.min(MAX_ZOOM, Math.max(1, z.s))
    const mx = ((s - 1) * r.width) / 2
    const my = ((s - 1) * r.height) / 2
    return { s, x: Math.min(mx, Math.max(-mx, z.x)), y: Math.min(my, Math.max(-my, z.y)) }
  }

  /** Cadre sous le point (gauche ou droite) ; à défaut le premier. */
  const rectAt = (p: XY) => {
    const rects = boxes.current.flatMap((b) => (b ? [b.getBoundingClientRect()] : []))
    return rects.find((r) => p.x >= r.left && p.x <= r.right) ?? rects[0] ?? null
  }
  /** Coordonnées relatives au centre du cadre. */
  const local = (p: XY, r: DOMRect) => ({ x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 })

  /** Zoome à l'échelle `scale` : le point de la photo qui était sous `from` vient sous `to`. */
  const zoomAround = (z: Zoom, from: XY, to: XY, scale: number, r: DOMRect) => {
    const p0 = local(from, r)
    const p = local(to, r)
    const cx = (p0.x - z.x) / z.s
    const cy = (p0.y - z.y) / z.s
    return clamp({ s: scale, x: p.x - scale * cx, y: p.y - scale * cy }, r)
  }

  /** (Re)part de l'état courant, selon le nombre de doigts posés. */
  function begin() {
    const s = g.current
    const pts = [...s.pointers.values()]
    s.start = current.current
    if (pts.length >= 2) {
      const [a, b] = pts
      s.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      s.dist = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))
    } else if (pts.length === 1) s.mid = pts[0]
    s.rect = rectAt(s.mid)
  }

  const handlers = {
    onPointerDown: (ev: React.PointerEvent<HTMLDivElement>) => {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      const s = g.current
      s.moved = s.pointers.size > 0 // deuxième doigt : ce n'est plus un toucher
      s.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      setSmooth(false)
      begin()
    },
    onPointerMove: (ev: React.PointerEvent<HTMLDivElement>) => {
      const s = g.current
      if (!s.pointers.has(ev.pointerId) || !s.rect) return
      s.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      const pts = [...s.pointers.values()]
      if (pts.length >= 2) {
        const [a, b] = pts
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const dist = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))
        setZoom(zoomAround(s.start, s.mid, mid, s.start.s * (dist / s.dist), s.rect))
      } else {
        const dx = pts[0].x - s.mid.x
        const dy = pts[0].y - s.mid.y
        if (!s.moved && Math.hypot(dx, dy) < 6) return
        s.moved = true
        setZoom(clamp({ ...s.start, x: s.start.x + dx, y: s.start.y + dy }, s.rect))
      }
    },
    onPointerUp: (ev: React.PointerEvent<HTMLDivElement>) => {
      const s = g.current
      if (!s.pointers.delete(ev.pointerId)) return
      if (s.pointers.size > 0) {
        begin() // un doigt reste posé après un pincement : on continue en glissant
        return
      }
      if (s.moved) return
      const tap = { at: performance.now(), x: ev.clientX, y: ev.clientY }
      const last = s.lastTap
      if (tap.at - last.at < 320 && Math.hypot(tap.x - last.x, tap.y - last.y) < 30) {
        // Double-toucher : ×2,5 sur le point touché, ou retour à ×1.
        const r = rectAt(tap)
        setSmooth(true)
        setZoom(current.current.s > 1.05 || !r ? NO_ZOOM : zoomAround(current.current, tap, tap, 2.5, r))
        s.lastTap = { at: 0, x: 0, y: 0 }
      } else s.lastTap = tap
    },
    onPointerCancel: (ev: React.PointerEvent<HTMLDivElement>) => {
      const s = g.current
      s.pointers.delete(ev.pointerId)
      if (s.pointers.size > 0) begin()
    },
  }

  const boxRef = (i: number) => (el: HTMLDivElement | null) => {
    boxes.current[i] = el
  }

  const reset = useRef(() => {
    current.current = NO_ZOOM
    setZoomState(NO_ZOOM)
  }).current

  const style: React.CSSProperties = {
    transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
    transition: smooth ? 'transform 0.25s ease-out' : 'none',
    willChange: 'transform',
  }

  return { handlers, boxRef, style, reset }
}
