import { describe, expect, it } from 'vitest'
import { parseWeightCsv } from './csv'

describe('import CSV', () => {
  it('lit un export avec ; guillemets, virgule décimale et colonnes manquantes', () => {
    const csv = [
      '﻿"Date";"Jour de la semaine";"Poids (kg)";"IMC";"Note";"Masse graisseuse (%)"',
      '"2026-09-24";"jeudi";"101,9";"30,1"',
      '"2026-09-23";"mercredi";"102,1";"30,2"',
      '',
      '"2026-08-20";"jeudi";"105,3";"31,1"',
    ].join('\r\n')
    const r = parseWeightCsv(csv)
    expect(r.skipped).toBe(0)
    expect(r.entries).toEqual([
      { date: '2026-08-20', weight: 105.3 },
      { date: '2026-09-23', weight: 102.1 },
      { date: '2026-09-24', weight: 101.9 },
    ])
  })

  it('accepte le format anglais et les dates JJ/MM/AAAA', () => {
    const r = parseWeightCsv('Date,Weight (kg),Fat\n24/09/2026,101.9,\n23/09/2026,102.1,')
    expect(r.entries.map((e) => e.date)).toEqual(['2026-09-23', '2026-09-24'])
  })

  it('ignore les lignes illisibles et les dates impossibles', () => {
    const r = parseWeightCsv('Date;Poids\n2026-02-30;100\n2026-09-01;abc\n2026-09-02;99,5')
    expect(r.entries).toEqual([{ date: '2026-09-02', weight: 99.5 }])
    expect(r.skipped).toBe(2)
  })

  it('refuse un fichier sans colonnes reconnaissables', () => {
    expect(() => parseWeightCsv('Nom;Valeur\nfoo;1')).toThrow(/introuvables/)
  })
})
