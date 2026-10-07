/** Date calendaire locale au format 'YYYY-MM-DD'. */
export type ISODate = string

export interface Program {
  id: 'main'
  heightCm: number
  startDate: ISODate
  endDate: ISODate
  startWeight: number
  targetWeight: number
  // Le rythme visé n'est pas stocké : il se déduit toujours des dates (voir objectiveRate),
  // pour que date de fin et rythme ne puissent jamais se contredire.
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

/** Rectangle de recadrage, en fractions de la photo entière (0 → 1). */
export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

export interface Photo {
  id?: number
  date: ISODate
  pose: Pose
  /** Photo affichée (recadrée s'il y a lieu). */
  blob: PhotoData
  thumb: PhotoData
  /** Photo entière, gardée pour pouvoir recadrer à nouveau ; absente si la photo n'est pas recadrée. */
  original?: PhotoData
  crop?: Crop
}
