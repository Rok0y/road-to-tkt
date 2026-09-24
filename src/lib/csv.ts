import type { Entry, ISODate } from '../types'

export interface CsvImport {
  entries: Entry[]
  skipped: number // lignes illisibles ignorées
}

/** Découpe une ligne CSV en respectant les guillemets ("103,4" reste une seule valeur). */
function splitLine(line: string, sep: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = !quoted
    } else if (c === sep && !quoted) {
      cells.push(cell)
      cell = ''
    } else cell += c
  }
  cells.push(cell)
  return cells.map((s) => s.trim())
}

function detectSeparator(header: string): string {
  const counts = [';', '\t', ','].map((s) => ({ s, n: splitLine(header, s).length }))
  return counts.sort((a, b) => b.n - a.n)[0].s
}

/** Accepte 2026-09-24, 24/09/2026, 24-09-2026, 24.09.2026. */
function parseDate(raw: string): ISODate | null {
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return iso(+m[3], +m[2], +m[1])
  return null
}

function iso(y: number, m: number, d: number): ISODate | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

function parseWeight(raw: string): number | null {
  const n = Number(raw.replace(/\s|kg/gi, '').replace(',', '.'))
  return raw !== '' && Number.isFinite(n) && n >= 20 && n <= 400 ? Math.round(n * 100) / 100 : null
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Lit un export CSV d'une autre app de suivi : séparateur ; , ou tabulation, guillemets,
 * virgule décimale. Les colonnes « Date » et « Poids » / « Weight » sont repérées par leur titre.
 */
export function parseWeightCsv(text: string): CsvImport {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) throw new Error('Le fichier est vide.')

  const sep = detectSeparator(lines[0])
  const header = splitLine(lines[0], sep).map(norm)
  let dateCol = header.findIndex((h) => h.startsWith('date'))
  let weightCol = header.findIndex((h) => h.startsWith('poids') || h.startsWith('weight') || h.startsWith('masse corporelle'))
  const hasHeader = dateCol !== -1 && weightCol !== -1
  if (!hasHeader) {
    // Sans en-tête reconnu : première colonne = date, deuxième colonne numérique = poids.
    dateCol = 0
    weightCol = 1
    if (parseDate(splitLine(lines[0], sep)[0] ?? '') === null) {
      throw new Error('Colonnes « Date » et « Poids » introuvables dans le fichier.')
    }
  }

  const byDate = new Map<ISODate, number>()
  let skipped = 0
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cells = splitLine(line, sep)
    const date = parseDate(cells[dateCol] ?? '')
    const weight = parseWeight(cells[weightCol] ?? '')
    if (date && weight !== null) byDate.set(date, weight)
    else skipped++
  }
  const entries = [...byDate].map(([date, weight]) => ({ date, weight })).sort((a, b) => (a.date < b.date ? -1 : 1))
  return { entries, skipped }
}
