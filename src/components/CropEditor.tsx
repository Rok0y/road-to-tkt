import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBlobUrl } from '../hooks'
import { FULL_CROP } from '../lib/images'
import type { Crop, PhotoData } from '../types'

/** Cadre proposé au départ : bande centrale, toute la hauteur (le corps debout, sans le décor). */
export const DEFAULT_CROP: Crop = { x: 0.2, y: 0, w: 0.6, h: 1 }
const MIN_SIZE = 0.08

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: { id: Handle; left: string; top: string; cursor: string }[] = [
  { id: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { id: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
  { id: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { id: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
  { id: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { id: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
  { id: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
  { id: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
]

/** Déplace ou redimensionne le cadre de (dx, dy) — fractions de la photo — sans sortir de la photo. */
function adjust(c: Crop, handle: Handle, dx: number, dy: number): Crop {
  if (handle === 'move') {
    return { ...c, x: Math.min(1 - c.w, Math.max(0, c.x + dx)), y: Math.min(1 - c.h, Math.max(0, c.y + dy)) }
  }
  let left = c.x
  let top = c.y
  let right = c.x + c.w
  let bottom = c.y + c.h
  if (handle.includes('w')) left = Math.min(right - MIN_SIZE, Math.max(0, left + dx))
  if (handle.includes('e')) right = Math.max(left + MIN_SIZE, Math.min(1, right + dx))
  if (handle.includes('n')) top = Math.min(bottom - MIN_SIZE, Math.max(0, top + dy))
  if (handle.includes('s')) bottom = Math.max(top + MIN_SIZE, Math.min(1, bottom + dy))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/**
 * Recadrage libre en plein écran : la photo entière, un cadre qu'on déplace et qu'on étire
 * par les coins et les côtés. Le cadre est exprimé en fractions de la photo.
 */
export function CropEditor({
  source,
  initial,
  cancelLabel = 'Annuler',
  onCancel,
  onConfirm,
}: {
  source: PhotoData
  initial?: Crop
  cancelLabel?: string
  onCancel: () => void
  onConfirm: (crop: Crop) => void
}) {
  const url = useBlobUrl(source)
  const [crop, setCrop] = useState<Crop>(initial ?? DEFAULT_CROP)
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; handle: Handle; x: number; y: number; start: Crop } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current) return // un seul doigt pilote le cadre
    const handle = (ev.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
    if (!handle) return
    ev.currentTarget.setPointerCapture(ev.pointerId)
    drag.current = { id: ev.pointerId, handle, x: ev.clientX, y: ev.clientY, start: crop }
  }
  const onPointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const frame = frameRef.current
    if (!d || d.id !== ev.pointerId || !frame) return
    const r = frame.getBoundingClientRect()
    setCrop(adjust(d.start, d.handle, (ev.clientX - d.x) / r.width, (ev.clientY - d.y) / r.height))
  }
  const onPointerEnd = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === ev.pointerId) drag.current = null
  }

  const pct = (v: number) => `${v * 100}%`
  const box: React.CSSProperties = { position: 'absolute', left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }
  const bar: React.CSSProperties = { color: '#fff', fontSize: 17, padding: '6px 4px' }

  // Rendu dans <body> : rien d'un parent (feuille animée, défilement) ne vient le contraindre.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recadrer la photo"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: '#000',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: 'calc(var(--safe-top) + 8px) 16px calc(var(--safe-bottom) + 12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onCancel} style={bar}>
          {cancelLabel}
        </button>
        <strong>Recadrer</strong>
        <button onClick={() => onConfirm(crop)} style={{ ...bar, fontWeight: 700, color: '#ffd60a' }}>
          OK
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 0' }}>
        {url && (
          // Le cadre épouse exactement la photo : les fractions du recadrage y deviennent des pourcentages.
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            style={{ position: 'relative', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
          >
            <img
              src={url}
              alt="Photo à recadrer"
              draggable={false}
              style={{
                display: 'block',
                maxWidth: 'calc(100vw - 32px)',
                maxHeight: 'calc(100dvh - var(--safe-top) - var(--safe-bottom) - 150px)',
              }}
            />
            {/* Voile sur ce qui sera coupé, limité à la photo (les poignées, elles, peuvent déborder). */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              <div style={{ ...box, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }} />
            </div>
            <div
              data-handle="move"
              style={{
                ...box,
                border: '1.5px solid #fff',
                cursor: 'move',
                // Repères des tiers, pour centrer le corps.
                backgroundImage:
                  'linear-gradient(to right, transparent calc(33.33% - 0.5px), rgba(255,255,255,0.35) calc(33.33% - 0.5px), rgba(255,255,255,0.35) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.67% - 0.5px), rgba(255,255,255,0.35) calc(66.67% - 0.5px), rgba(255,255,255,0.35) calc(66.67% + 0.5px), transparent calc(66.67% + 0.5px)),' +
                  'linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgba(255,255,255,0.35) calc(33.33% - 0.5px), rgba(255,255,255,0.35) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.67% - 0.5px), rgba(255,255,255,0.35) calc(66.67% - 0.5px), rgba(255,255,255,0.35) calc(66.67% + 0.5px), transparent calc(66.67% + 0.5px))',
              }}
            >
              {HANDLES.map((h) => (
                // Zone tactile de 44 px, poignée visible au centre.
                <div
                  key={h.id}
                  data-handle={h.id}
                  style={{
                    position: 'absolute',
                    left: h.left,
                    top: h.top,
                    width: 44,
                    height: 44,
                    margin: '-22px 0 0 -22px',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: h.cursor,
                  }}
                >
                  <span
                    style={{
                      width: h.id.length === 2 ? 16 : 12,
                      height: h.id.length === 2 ? 16 : 12,
                      borderRadius: 8,
                      background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
        <button onClick={() => setCrop(DEFAULT_CROP)} style={{ ...bar, fontSize: 15, opacity: 0.85 }}>
          Cadre centré
        </button>
        <button onClick={() => setCrop(FULL_CROP)} style={{ ...bar, fontSize: 15, opacity: 0.85 }}>
          Photo entière
        </button>
      </div>
      <div className="small" style={{ textAlign: 'center', opacity: 0.55, marginTop: 2 }}>
        Fais glisser le cadre ou ses poignées pour ne garder que le corps
      </div>
    </div>,
    document.body,
  )
}
