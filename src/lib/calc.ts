import type { Entry, ISODate, Program } from '../types'
import { addDays, dayNumber, diffDays } from './dates'

export const SMOOTHING_DAYS = 7
export const CURRENT_RATE_DAYS = 14

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** +1 si l'objectif est une prise de poids, -1 pour une perte. */
export function direction(program: Program): 1 | -1 {
  return program.targetWeight >= program.startWeight ? 1 : -1
}

/** Poids le plus bas sur les 7 derniers jours (J-6 → J inclus). */
export function smoothedWeight(entries: Entry[], onDate: ISODate): number | null {
  const from = addDays(onDate, -(SMOOTHING_DAYS - 1))
  let min: number | null = null
  for (const e of entries) {
    if (e.date >= from && e.date <= onDate && (min === null || e.weight < min)) min = e.weight
  }
  return min
}

/** Poids affiché : min sur 7 jours, sinon dernière pesée connue. */
export function currentWeight(entries: Entry[], today: ISODate): number | null {
  const smoothed = smoothedWeight(entries, today)
  if (smoothed !== null) return smoothed
  const past = sortEntries(entries).filter((e) => e.date <= today)
  return past.length ? past[past.length - 1].weight : null
}

// ---------- IMC ----------

export function bmi(weight: number, heightCm: number): number {
  const h = heightCm / 100
  return weight / (h * h)
}

export interface BmiCategory {
  label: string
  color: string
}

export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return { label: 'Maigreur', color: '#5ac8fa' }
  if (value < 25) return { label: 'Poids normal', color: '#34c759' }
  if (value < 30) return { label: 'Surpoids', color: '#ffcc00' }
  if (value < 35) return { label: 'Obésité modérée', color: '#ff9500' }
  if (value < 40) return { label: 'Obésité sévère', color: '#ff6b3d' }
  return { label: 'Obésité massive', color: '#ff3b30' }
}

/** Poids correspondant à un IMC donné, utile pour afficher « IMC 25 à X kg ». */
export function weightForBmi(value: number, heightCm: number): number {
  const h = heightCm / 100
  return value * h * h
}

// ---------- Progression & paliers ----------

/** Part du chemin parcouru, entre 0 et 1 (bornée). */
export function progress(program: Program, weight: number): number {
  const total = program.targetWeight - program.startWeight
  if (total === 0) return 1
  return Math.min(1, Math.max(0, (weight - program.startWeight) / total))
}

export interface Milestone {
  index: number // 1..10
  weight: number
  reachedOn: ISODate | null
}

/** 10 paliers, un tous les 10 % du poids à perdre ; un palier atteint le reste. */
export function milestones(program: Program, entries: Entry[]): Milestone[] {
  const dir = direction(program)
  const step = (program.targetWeight - program.startWeight) / 10
  const sorted = sortEntries(entries).filter((e) => e.date >= program.startDate)
  return Array.from({ length: 10 }, (_, i) => {
    const weight = round(program.startWeight + step * (i + 1), 2)
    const hit = sorted.find((e) => (e.weight - weight) * dir >= -1e-9)
    return { index: i + 1, weight, reachedOn: hit ? hit.date : null }
  })
}

// ---------- Rythmes (kg / semaine, signés) ----------

/** Rythme visé (kg/semaine, positif) pour aller du départ à l'objectif entre les deux dates. */
export function rateForEndDate(startWeight: number, targetWeight: number, startDate: ISODate, endDate: ISODate): number | null {
  const days = diffDays(startDate, endDate)
  return days > 0 ? (Math.abs(targetWeight - startWeight) / days) * 7 : null
}

/** Date de fin correspondant à un rythme visé (kg/semaine, positif). */
export function endDateForRate(startWeight: number, targetWeight: number, startDate: ISODate, rate: number): ISODate | null {
  if (!(rate > 0)) return null
  const days = Math.ceil((Math.abs(targetWeight - startWeight) / rate) * 7)
  return days > 0 && days < 365 * 20 ? addDays(startDate, days) : null
}

/** Rythme objectif signé (négatif pour une perte), déduit de la date de fin. */
export function objectiveRate(program: Program): number {
  const rate = rateForEndDate(program.startWeight, program.targetWeight, program.startDate, program.endDate) ?? 0
  return direction(program) * rate
}

/** Pente (régression linéaire) des pesées des 14 derniers jours. */
export function currentRate(entries: Entry[], today: ISODate, windowDays = CURRENT_RATE_DAYS): number | null {
  const from = addDays(today, -(windowDays - 1))
  const pts = entries.filter((e) => e.date >= from && e.date <= today)
  if (pts.length < 2) return null
  const xs = pts.map((e) => dayNumber(e.date))
  const span = Math.max(...xs) - Math.min(...xs)
  if (span < 3) return null
  const n = pts.length
  const mx = xs.reduce((s, x) => s + x, 0) / n
  const my = pts.reduce((s, e) => s + e.weight, 0) / n
  let num = 0
  let den = 0
  pts.forEach((e, i) => {
    num += (xs[i] - mx) * (e.weight - my)
    den += (xs[i] - mx) ** 2
  })
  return den === 0 ? null : (num / den) * 7
}

/** Rythme réel depuis la date de début, à partir du poids affiché. */
export function overallRate(program: Program, weight: number, today: ISODate): number | null {
  const days = diffDays(program.startDate, today)
  if (days < 1) return null
  return ((weight - program.startWeight) / days) * 7
}

// ---------- Projections ----------

/** Date à laquelle `target` sera atteint au rythme donné, ou null si jamais. */
export function projectDate(
  weight: number,
  target: number,
  ratePerWeek: number | null,
  today: ISODate,
): ISODate | null {
  const remaining = target - weight
  if (Math.abs(remaining) < 1e-9) return today
  if (ratePerWeek === null || ratePerWeek * remaining <= 0) return null
  const days = Math.ceil((remaining / ratePerWeek) * 7)
  if (days > 365 * 20) return null
  return addDays(today, days)
}

export function nextMilestone(list: Milestone[]): Milestone | null {
  return list.find((m) => m.reachedOn === null) ?? null
}

// ---------- Résumé hebdomadaire ----------

export interface WeekSummary {
  week: number
  from: ISODate
  to: ISODate
  weight: number | null
  delta: number | null
}

/**
 * Semaines ancrées sur la date de début (S1 = début → début + 6).
 * Poids retenu = dernière pesée de la semaine ; delta vs dernière semaine connue
 * (S1 comparée au poids de départ).
 */
export function weeklySummary(program: Program, entries: Entry[], today: ISODate): WeekSummary[] {
  const sorted = sortEntries(entries).filter((e) => e.date >= program.startDate)
  const lastDate = sorted.length ? sorted[sorted.length - 1].date : today
  const until = lastDate > today ? lastDate : today
  const count = Math.max(0, Math.floor(diffDays(program.startDate, until) / 7) + 1)

  const weeks: WeekSummary[] = []
  let previous = program.startWeight
  for (let i = 0; i < count; i++) {
    const from = addDays(program.startDate, i * 7)
    const to = addDays(from, 6)
    const inWeek = sorted.filter((e) => e.date >= from && e.date <= to)
    const weight = inWeek.length ? inWeek[inWeek.length - 1].weight : null
    const delta = weight === null ? null : round(weight - previous, 2)
    if (weight !== null) previous = weight
    weeks.push({ week: i + 1, from, to, weight, delta })
  }
  return weeks
}

// ---------- Graphique ----------

export type Granularity = 'day' | 'week' | 'month' | 'year'

export interface Point {
  x: ISODate
  y: number
}

/** Série « min 7 jours » évaluée à chaque date de pesée. */
export function smoothedSeries(entries: Entry[]): Point[] {
  return sortEntries(entries).map((e) => ({ x: e.date, y: smoothedWeight(entries, e.date)! }))
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

