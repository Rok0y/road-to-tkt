import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { ISODate } from '../types'
import { toLocalDate } from './dates'

const numberFormats = new Map<number, Intl.NumberFormat>()

export function fmtNumber(value: number, digits = 1): string {
  let f = numberFormats.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    numberFormats.set(digits, f)
  }
  return f.format(value)
}

export function fmtKg(value: number, digits = 1): string {
  return `${fmtNumber(value, digits)} kg`
}

/** Écart signé : « −1,90 kg », « +0,40 kg ». */
export function fmtDelta(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±'
  return `${sign}${fmtNumber(Math.abs(value), digits)} kg`
}

export function fmtRate(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${fmtNumber(Math.abs(value), 2)}`
}

export function fmtDate(iso: ISODate, pattern = 'd MMM yyyy'): string {
  return format(toLocalDate(iso), pattern, { locale: fr })
}

/** Accepte « 104,3 » comme « 104.3 ». */
export function parseDecimal(input: string): number | null {
  const n = Number(input.trim().replace(',', '.'))
  return input.trim() !== '' && Number.isFinite(n) ? n : null
}

/** Majuscule sur la première lettre uniquement : « Jeu. 24 sept. 2026 ». */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
