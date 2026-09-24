import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteEntry, deletePhoto, movePhotos, saveEntry, savePhoto } from '../db/db'
import { compressPhoto } from '../lib/images'
import { fmtNumber, parseDecimal } from '../lib/format'
import { todayISO } from '../lib/dates'
import { useBlobUrl } from '../hooks'
import { POSES, POSE_LABELS, type Entry, type Pose } from '../types'
import { Sheet } from './ui'

type Slot = { kind: 'keep' } | { kind: 'new'; blob: Blob; thumb: Blob } | { kind: 'remove' } | { kind: 'busy' }

interface Props {
  entry?: Entry // pesée à modifier ; absent = nouvelle pesée
  lastWeight?: number
  onClose: () => void
}

export function EntrySheet({ entry, lastWeight, onClose }: Props) {
  const [date, setDate] = useState(entry?.date ?? todayISO())
  const [weight, setWeight] = useState(entry ? fmtNumber(entry.weight) : '')
  const [slots, setSlots] = useState<Record<Pose, Slot>>({ front: { kind: 'keep' }, side: { kind: 'keep' }, back: { kind: 'keep' } })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Photos déjà enregistrées pour la date d'origine de la pesée.
  const photoDate = entry?.date ?? date
  const existing = useLiveQuery(() => db.photos.where('date').equals(photoDate).toArray(), [photoDate])

  // Si on choisit une date qui a déjà une pesée, on la signale.
  const clash = useLiveQuery(
    async () => (date !== entry?.date ? ((await db.entries.get(date)) ?? null) : null),
    [date, entry?.date],
  )
  useEffect(() => {
    if (!entry && clash && weight === '') setWeight(fmtNumber(clash.weight))
  }, [clash, entry, weight])

  const parsed = parseDecimal(weight)
  const valid = parsed !== null && parsed >= 20 && parsed <= 400 && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const busy = POSES.some((p) => slots[p].kind === 'busy')

  async function pick(pose: Pose, file: File | undefined) {
    if (!file) return
    setSlots((s) => ({ ...s, [pose]: { kind: 'busy' } }))
    try {
      const { blob, thumb } = await compressPhoto(file)
      setSlots((s) => ({ ...s, [pose]: { kind: 'new', blob, thumb } }))
    } catch {
      setSlots((s) => ({ ...s, [pose]: { kind: 'keep' } }))
      setError("Impossible de lire cette photo.")
    }
  }

  async function save() {
    if (!valid || parsed === null) return
    setSaving(true)
    try {
      if (entry && entry.date !== date) {
        await movePhotos(entry.date, date)
        await db.entries.delete(entry.date)
      }
      await saveEntry({ date, weight: Math.round(parsed * 100) / 100 })
      for (const pose of POSES) {
        const slot = slots[pose]
        if (slot.kind === 'new') await savePhoto(date, pose, slot.blob, slot.thumb)
        if (slot.kind === 'remove') await deletePhoto(date, pose)
      }
      onClose()
    } catch (err) {
      setError(`Enregistrement impossible : ${(err as Error).message}`)
      setSaving(false)
    }
  }

  async function remove() {
    if (!entry) return
    if (!confirm('Supprimer cette pesée et ses photos ?')) return
    await deleteEntry(entry.date)
    onClose()
  }

  return (
    <Sheet
      title={entry ? 'Modifier la pesée' : 'Nouvelle pesée'}
      onClose={onClose}
      action={
        <button className="link" style={{ fontWeight: 600 }} disabled={!valid || busy || saving} onClick={save}>
          {saving ? '…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="list">
        <div className="field">
          <label htmlFor="entry-date">Date</label>
          <input id="entry-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="entry-weight">Poids</label>
          <input
            id="entry-weight"
            inputMode="decimal"
            autoFocus={!entry}
            placeholder={lastWeight ? fmtNumber(lastWeight) : '0,0'}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            style={{ fontSize: 22, fontWeight: 600, color: 'var(--label)' }}
          />
          <span className="unit">kg</span>
        </div>
      </div>
      {clash && !entry && (
        <p className="section-footer">Une pesée existe déjà ce jour-là ({fmtNumber(clash.weight)} kg) : elle sera remplacée.</p>
      )}

      <h3 className="section-title" style={{ fontSize: 17 }}>
        Photos <span className="muted small" style={{ fontWeight: 400 }}>facultatif</span>
      </h3>
      <div className="grid-3">
        {POSES.map((pose) => (
          <PhotoSlot
            key={pose}
            pose={pose}
            slot={slots[pose]}
            stored={slots[pose].kind === 'keep' ? existing?.find((p) => p.pose === pose)?.thumb : undefined}
            onPick={(f) => pick(pose, f)}
            onRemove={() => setSlots((s) => ({ ...s, [pose]: { kind: 'remove' } }))}
          />
        ))}
      </div>

      {error && (
        <p className="section-footer bad" role="alert">
          {error}
        </p>
      )}

      {entry && (
        <button className="btn danger" style={{ marginTop: 28 }} onClick={remove}>
          Supprimer la pesée
        </button>
      )}
    </Sheet>
  )
}

function PhotoSlot({
  pose,
  slot,
  stored,
  onPick,
  onRemove,
}: {
  pose: Pose
  slot: Slot
  stored?: Blob
  onPick: (f: File | undefined) => void
  onRemove: () => void
}) {
  const preview = slot.kind === 'new' ? slot.thumb : stored
  const url = useBlobUrl(preview)
  return (
    <label className={`photo-slot${url ? ' filled' : ''}`}>
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {url ? (
        <>
          <img src={url} alt={POSE_LABELS[pose]} />
          <button
            type="button"
            className="remove"
            aria-label={`Retirer la photo ${POSE_LABELS[pose]}`}
            onClick={(e) => {
              e.preventDefault()
              onRemove()
            }}
          >
            ✕
          </button>
          <span className="tag">{POSE_LABELS[pose]}</span>
        </>
      ) : slot.kind === 'busy' ? (
        <span>Traitement…</span>
      ) : (
        <>
          <span style={{ fontSize: 26, color: 'var(--blue)' }}>＋</span>
          <span>{POSE_LABELS[pose]}</span>
        </>
      )}
    </label>
  )
}
