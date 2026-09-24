import type { ISODate } from '../types'

const DAY_MS = 86_400_000

/** Numéro de jour depuis l'epoch, calculé en UTC pour ignorer les changements d'heure. */
export function dayNumber(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

export function fromDayNumber(n: number): ISODate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(iso) + days)
}

/** Nombre de jours de `from` à `to` (positif si `to` est après). */
export function diffDays(from: ISODate, to: ISODate): number {
  return dayNumber(to) - dayNumber(from)
}

export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Lundi de la semaine calendaire contenant `iso`. */
export function mondayOf(iso: ISODate): ISODate {
  const n = dayNumber(iso)
  const weekday = new Date(n * DAY_MS).getUTCDay() // 0 = dimanche
  return fromDayNumber(n - ((weekday + 6) % 7))
}

export function monthOf(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`
}

export function yearOf(iso: ISODate): ISODate {
  return `${iso.slice(0, 4)}-01-01`
}

/** Convertit une ISODate en objet Date local à midi (sûr pour l'affichage). */
export function toLocalDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}
