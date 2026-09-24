import type { Entry, Photo, Pose } from '../types'
import { POSE_LABELS, POSES } from '../types'
import { addDays, diffDays, todayISO } from '../lib/dates'
import { fmtDate } from '../lib/format'
import { db } from './db'

function placeholder(pose: Pose, date: string, shrink: number, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = Math.round(size * 4 / 3)
  const ctx = canvas.getContext('2d')!
  const s = size / 300
  ctx.fillStyle = '#e5e5ea'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#8e8e93'
  const bodyW = (pose === 'side' ? 70 : 120) * (1 - shrink) * s
  ctx.beginPath()
  ctx.arc(size / 2, 70 * s, 32 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(size / 2 - bodyW / 2, 110 * s, bodyW, 200 * s, 40 * s)
  ctx.fill()
  ctx.fillStyle = '#3a3a3c'
  ctx.font = `600 ${16 * s}px -apple-system, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(`${POSE_LABELS[pose]} · ${fmtDate(date, 'd MMM')}`, size / 2, 370 * s)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8))
}

/** Remplit la base avec ~12 semaines de pesées réalistes pour essayer l'app. */
export async function loadDemoData() {
  const today = todayISO()
  const startDate = addDays(today, -84)
  const startWeight = 108.4
  const entries: Entry[] = []
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let d = 0; d <= 84; d++) {
    if (rand() < 0.15) continue // quelques jours sans pesée
    const trend = startWeight - 0.62 * (d / 7) + 0.3 * Math.sin(d / 9)
    const noise = (rand() - 0.5) * 1.1
    entries.push({ date: addDays(startDate, d), weight: Math.round((trend + noise) * 10) / 10 })
  }
  const photoDates = [startDate, addDays(startDate, 42), entries[entries.length - 1].date]
  const photos: Photo[] = []
  for (const date of photoDates) {
    const shrink = (diffDays(startDate, date) / 84) * 0.25
    for (const pose of POSES) {
      photos.push({
        date,
        pose,
        blob: await placeholder(pose, date, shrink, 600),
        thumb: await placeholder(pose, date, shrink, 200),
      })
    }
  }
  await db.transaction('rw', db.program, db.entries, db.photos, async () => {
    await Promise.all([db.program.clear(), db.entries.clear(), db.photos.clear()])
    await db.program.put({
      id: 'main',
      heightCm: 180,
      startDate,
      endDate: addDays(startDate, 7 * 40),
      startWeight,
      targetWeight: 88,
      targetRatePerWeek: 0.5,
    })
    await db.entries.bulkPut(entries)
    await db.photos.bulkAdd(photos)
  })
}
