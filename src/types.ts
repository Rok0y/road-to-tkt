/** Date calendaire locale au format 'YYYY-MM-DD'. */
export type ISODate = string

export interface Program {
  id: 'main'
  heightCm: number
  startDate: ISODate
  endDate: ISODate
  startWeight: number
  targetWeight: number
  /** Rythme visé, en kg/semaine, toujours positif (dans le sens de l'objectif). */
  targetRatePerWeek: number
}

export interface Entry {
  date: ISODate
  weight: number
}

export type Pose = 'front' | 'side' | 'back'

export const POSES: Pose[] = ['front', 'side', 'back']

export const POSE_LABELS: Record<Pose, string> = {
  front: 'Face',
  side: 'Profil',
  back: 'Dos',
}

/**
 * Octets JPEG. Stockés en ArrayBuffer et non en Blob : le WebKit d'iOS refuse parfois d'écrire
 * des Blob dans IndexedDB (« Error preparing Blob/File data »). Les anciennes photos en Blob restent lisibles.
 */
export type PhotoData = ArrayBuffer | Blob

export interface Photo {
  id?: number
  date: ISODate
  pose: Pose
  blob: PhotoData
  thumb: PhotoData
}
