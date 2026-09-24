import { describe, expect, it } from 'vitest'
import type { Entry, Program } from '../types'
import {
  bmi,
  bmiCategory,
  currentRate,
  currentWeight,
  endDateForRate,
  milestones,
  nextMilestone,
  objectiveRate,
  overallRate,
  progress,
  projectDate,
  rateForEndDate,
  smoothedWeight,
  weeklySummary,
} from './calc'
import { diffDays, mondayOf } from './dates'

const program: Program = {
  id: 'main',
  heightCm: 180,
  startDate: '2026-08-17',
  endDate: '2027-02-15',
  startWeight: 110,
  targetWeight: 90,
}

const e = (date: string, weight: number): Entry => ({ date, weight })

describe('dates', () => {
  it('ignore le passage à l’heure d’hiver', () => {
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
  })
  it('trouve le lundi de la semaine', () => {
    expect(mondayOf('2026-08-23')).toBe('2026-08-17') // dimanche → lundi précédent
    expect(mondayOf('2026-08-17')).toBe('2026-08-17')
  })
})

describe('poids affiché (min 7 jours)', () => {
  const entries = [e('2026-08-10', 100), e('2026-08-18', 106), e('2026-08-20', 105.2), e('2026-08-23', 105.8)]
  it('prend le minimum de J-6 à J', () => {
    expect(smoothedWeight(entries, '2026-08-23')).toBe(105.2)
  })
  it('ignore les pesées hors fenêtre', () => {
    expect(smoothedWeight(entries, '2026-08-17')).toBeNull() // fenêtre 08-11 → 08-17
    expect(smoothedWeight(entries, '2026-08-16')).toBe(100) // fenêtre 08-10 → 08-16
  })
  it('retombe sur la dernière pesée si rien sur 7 jours', () => {
    expect(currentWeight(entries, '2026-09-10')).toBe(105.8)
  })
})

describe('IMC', () => {
  it('calcule et catégorise', () => {
    const v = bmi(97.2, 180)
    expect(v).toBeCloseTo(30, 1)
    expect(bmiCategory(24.9).label).toBe('Poids normal')
    expect(bmiCategory(30).label).toBe('Obésité modérée')
  })
})

describe('paliers', () => {
  it('crée un palier tous les 10 % du poids à perdre', () => {
    const list = milestones(program, [])
    expect(list.map((m) => m.weight)).toEqual([108, 106, 104, 102, 100, 98, 96, 94, 92, 90])
  })
  it('marque la première date d’atteinte et reste atteint', () => {
    const list = milestones(program, [e('2026-08-20', 108.4), e('2026-08-25', 107.9), e('2026-08-30', 108.3)])
    expect(list[0].reachedOn).toBe('2026-08-25')
    expect(list[1].reachedOn).toBeNull()
    expect(nextMilestone(list)?.weight).toBe(106)
  })
  it('borne la progression', () => {
    expect(progress(program, 100)).toBe(0.5)
    expect(progress(program, 112)).toBe(0)
    expect(progress(program, 85)).toBe(1)
  })
})

describe('rythmes', () => {
  it('rythme actuel = pente sur 14 jours', () => {
    const entries = Array.from({ length: 14 }, (_, i) =>
      e(`2026-09-${String(i + 1).padStart(2, '0')}`, 105 - (0.5 / 7) * i),
    )
    expect(currentRate(entries, '2026-09-14')).toBeCloseTo(-0.5, 5)
  })
  it('rythme actuel null si données insuffisantes', () => {
    expect(currentRate([e('2026-09-14', 100)], '2026-09-14')).toBeNull()
  })
  it('rythme général depuis le début', () => {
    expect(overallRate(program, 106, '2026-09-14')).toBeCloseTo(-1, 5) // 4 kg en 28 jours
  })
})

describe('projections', () => {
  it('calcule la date d’arrivée', () => {
    expect(projectDate(100, 90, -0.5, '2026-09-14')).toBe('2027-02-01') // 20 semaines = 140 j
  })
  it('null si on s’éloigne de la cible ou rythme nul', () => {
    expect(projectDate(100, 90, 0.2, '2026-09-14')).toBeNull()
    expect(projectDate(100, 90, 0, '2026-09-14')).toBeNull()
    expect(projectDate(100, 90, null, '2026-09-14')).toBeNull()
  })
  it('aujourd’hui si déjà sur la cible', () => {
    expect(projectDate(90, 90, -0.5, '2026-09-14')).toBe('2026-09-14')
  })
})

describe('résumé hebdomadaire', () => {
  it('ancre les semaines sur la date de début et prend la dernière pesée', () => {
    const weeks = weeklySummary(
      program,
      [e('2026-08-18', 109), e('2026-08-23', 108.2), e('2026-08-26', 106.5), e('2026-09-08', 105.9)],
      '2026-09-08',
    )
    expect(weeks).toHaveLength(4)
    expect(weeks[0]).toMatchObject({ week: 1, from: '2026-08-17', to: '2026-08-23', weight: 108.2, delta: -1.8 })
    expect(weeks[1]).toMatchObject({ from: '2026-08-24', to: '2026-08-30', weight: 106.5, delta: -1.7 })
    expect(weeks[2]).toMatchObject({ weight: null, delta: null }) // semaine vide
    expect(weeks[3]).toMatchObject({ weight: 105.9, delta: -0.6 }) // comparée à la dernière connue
  })
})

describe('date de fin ↔ rythme visé', () => {
  it('déduit le rythme de la date de fin (20 kg en 26 semaines)', () => {
    expect(rateForEndDate(110, 90, '2026-08-17', '2027-02-15')).toBeCloseTo(20 / 26, 6)
    expect(objectiveRate(program)).toBeCloseTo(-20 / 26, 6)
  })
  it('déduit la date de fin du rythme, et les deux sont réciproques', () => {
    expect(endDateForRate(110, 90, '2026-08-17', 0.5)).toBe('2027-05-24') // 40 semaines = 280 j
    const end = endDateForRate(105.3, 90, '2026-08-20', 0.35)!
    expect(rateForEndDate(105.3, 90, '2026-08-20', end)).toBeCloseTo(0.35, 2)
  })
  it('refuse un rythme nul ou une fin avant le début', () => {
    expect(endDateForRate(110, 90, '2026-08-17', 0)).toBeNull()
    expect(rateForEndDate(110, 90, '2026-08-17', '2026-08-01')).toBeNull()
  })
})
