import Dexie, { type EntityTable } from 'dexie'
import type { Entry, PhotoData, ISODate, Photo, Pose, Program } from '../types'

/*
 * Aucune requête de ce fichier n'ouvre de curseur IndexedDB : le WebKit d'iOS (Safari, Chrome iOS,
 * navigateurs intégrés) échoue avec « UnknownError: Unable to open cursor » sur certains curseurs.
 * On lit donc les tables en entier (getAll) et on trie / filtre en JavaScript, puis on écrit
 * par clé primaire. Les volumes (quelques centaines de lignes) rendent ça instantané.
 */

class RoadDB extends Dexie {
  program!: EntityTable<Program, 'id'>
  entries!: EntityTable<Entry, 'date'>
  photos!: EntityTable<Photo, 'id'>

  constructor() {
    super('road-to-tkt')
    this.version(1).stores({
      program: 'id',
      entries: 'date',
      photos: '++id, date, &[date+pose]',
    })
  }
}

export const db = new RoadDB()

const byDate = <T extends { date: ISODate }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

export async function allEntries(): Promise<Entry[]> {
  return (await db.entries.toArray()).sort(byDate)
}

export async function allPhotos(): Promise<Photo[]> {
  return (await db.photos.toArray()).sort(byDate)
}

export async function photosOn(date: ISODate): Promise<Photo[]> {
  return (await db.photos.toArray()).filter((p) => p.date === date)
}

async function photoIds(match: (p: Photo) => boolean): Promise<number[]> {
  return (await db.photos.toArray()).filter(match).map((p) => p.id!)
}

export async function saveProgram(program: Omit<Program, 'id'>) {
  await db.program.put({ ...program, id: 'main' })
}

/** Une pesée par jour : `put` remplace la pesée existante à cette date. */
export async function saveEntry(entry: Entry) {
  await db.entries.put(entry)
}

export async function deleteEntry(date: ISODate) {
  await db.transaction('rw', db.entries, db.photos, async () => {
    await db.entries.delete(date)
    await db.photos.bulkDelete(await photoIds((p) => p.date === date))
  })
}

/** Convertit en ArrayBuffer, le seul format d'image que le WebKit d'iOS stocke de façon fiable. */
export async function toBuffer(data: PhotoData): Promise<ArrayBuffer> {
  return data instanceof Blob ? data.arrayBuffer() : data
}

export async function savePhoto(date: ISODate, pose: Pose, blob: PhotoData, thumb: PhotoData) {
  // Conversion hors transaction : un `await` étranger à IndexedDB fermerait la transaction.
  const [full, small] = await Promise.all([toBuffer(blob), toBuffer(thumb)])
  await db.transaction('rw', db.photos, async () => {
    await db.photos.bulkDelete(await photoIds((p) => p.date === date && p.pose === pose))
    await db.photos.add({ date, pose, blob: full, thumb: small })
  })
}

export async function deletePhoto(date: ISODate, pose: Pose) {
  await db.photos.bulkDelete(await photoIds((p) => p.date === date && p.pose === pose))
}

/** Déplace les photos d'une date à une autre (quand on modifie la date d'une pesée). */
export async function movePhotos(from: ISODate, to: ISODate) {
  if (from === to) return
  await db.transaction('rw', db.photos, async () => {
    const all = await db.photos.toArray()
    const moved = all.filter((p) => p.date === from)
    const poses = new Set(moved.map((p) => p.pose))
    await db.photos.bulkDelete(all.filter((p) => p.date === to && poses.has(p.pose)).map((p) => p.id!))
    await db.photos.bulkPut(moved.map((p) => ({ ...p, date: to })))
  })
}

export async function clearAll() {
  await db.transaction('rw', db.program, db.entries, db.photos, async () => {
    await Promise.all([db.program.clear(), db.entries.clear(), db.photos.clear()])
  })
}
