import Dexie, { type EntityTable } from 'dexie'
import type { Entry, ISODate, Photo, Pose, Program } from '../types'

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
    await db.photos.where('date').equals(date).delete()
  })
}

export async function savePhoto(date: ISODate, pose: Pose, blob: Blob, thumb: Blob) {
  await db.transaction('rw', db.photos, async () => {
    await db.photos.where('[date+pose]').equals([date, pose]).delete()
    await db.photos.add({ date, pose, blob, thumb })
  })
}

export async function deletePhoto(date: ISODate, pose: Pose) {
  await db.photos.where('[date+pose]').equals([date, pose]).delete()
}

/** Déplace les photos d'une date à une autre (quand on modifie la date d'une pesée). */
export async function movePhotos(from: ISODate, to: ISODate) {
  if (from === to) return
  await db.transaction('rw', db.photos, async () => {
    const moved = await db.photos.where('date').equals(from).toArray()
    for (const p of moved) await db.photos.where('[date+pose]').equals([to, p.pose]).delete()
    await db.photos.where('date').equals(from).modify({ date: to })
  })
}

export async function clearAll() {
  await db.transaction('rw', db.program, db.entries, db.photos, async () => {
    await Promise.all([db.program.clear(), db.entries.clear(), db.photos.clear()])
  })
}
