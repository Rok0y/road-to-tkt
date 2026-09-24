import type { Entry, Photo, Pose, Program } from '../types'
import { todayISO } from '../lib/dates'
import { db } from './db'

interface BackupFile {
  app: 'road-to-tkt'
  version: 1
  exportedAt: string
  program: Program | null
  entries: Entry[]
  photos: { date: string; pose: Pose; blob: string; thumb: string }[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

export async function buildBackup(): Promise<File> {
  const [program, entries, photos] = await Promise.all([
    db.program.get('main'),
    db.entries.toArray(),
    db.photos.toArray(),
  ])
  const data: BackupFile = {
    app: 'road-to-tkt',
    version: 1,
    exportedAt: new Date().toISOString(),
    program: program ?? null,
    entries,
    photos: await Promise.all(
      photos.map(async (p) => ({
        date: p.date,
        pose: p.pose,
        blob: await blobToDataUrl(p.blob),
        thumb: await blobToDataUrl(p.thumb),
      })),
    ),
  }
  return new File([JSON.stringify(data)], `road-to-tkt-${todayISO()}.json`, { type: 'application/json' })
}

/** Sur iPhone, la feuille de partage permet d'enregistrer dans Fichiers / iCloud Drive. */
export async function shareOrDownload(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function restoreBackup(file: File): Promise<{ entries: number; photos: number }> {
  const data = JSON.parse(await file.text()) as BackupFile
  if (data.app !== 'road-to-tkt' || !Array.isArray(data.entries)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Road to TKT.")
  }
  const photos: Photo[] = await Promise.all(
    data.photos.map(async (p) => ({
      date: p.date,
      pose: p.pose,
      blob: await dataUrlToBlob(p.blob),
      thumb: await dataUrlToBlob(p.thumb),
    })),
  )
  await db.transaction('rw', db.program, db.entries, db.photos, async () => {
    await Promise.all([db.program.clear(), db.entries.clear(), db.photos.clear()])
    if (data.program) await db.program.put({ ...data.program, id: 'main' })
    await db.entries.bulkPut(data.entries)
    await db.photos.bulkAdd(photos)
  })
  return { entries: data.entries.length, photos: photos.length }
}
