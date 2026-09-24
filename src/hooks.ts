import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { allEntries, allPhotos, db } from './db/db'
import type { Entry, PhotoData, Program } from './types'
import { todayISO } from './lib/dates'
import {
  currentRate,
  currentWeight,
  milestones,
  nextMilestone,
  objectiveRate,
  overallRate,
  progress,
} from './lib/calc'

/** `undefined` pendant le chargement, `null` si aucun programme n'est configuré. */
export function useProgram(): Program | null | undefined {
  return useLiveQuery(async () => (await db.program.get('main')) ?? null, [])
}

/** Pesées triées par date croissante. */
export function useEntries(): Entry[] | undefined {
  return useLiveQuery(allEntries, [])
}

export function usePhotoDates(): Set<string> {
  const photos = useLiveQuery(allPhotos, [])
  return useMemo(() => new Set((photos ?? []).map((p) => p.date)), [photos])
}

/** Date du jour, rafraîchie quand l'app revient au premier plan (PWA laissée ouverte). */
export function useToday(): string {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const refresh = () => setToday(todayISO())
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return today
}

export function useStats(program: Program | null | undefined, entries: Entry[] | undefined, today: string) {
  return useMemo(() => {
    if (!program || !entries) return null
    const weight = currentWeight(entries, today) ?? program.startWeight
    const list = milestones(program, entries)
    return {
      weight,
      hasEntries: entries.length > 0,
      progress: progress(program, weight),
      milestones: list,
      reached: list.filter((m) => m.reachedOn).length,
      next: nextMilestone(list),
      rates: {
        objective: objectiveRate(program),
        current: currentRate(entries, today),
        overall: overallRate(program, weight, today),
      },
    }
  }, [program, entries, today])
}

export type Stats = NonNullable<ReturnType<typeof useStats>>

/** URL temporaire pour afficher une image (ArrayBuffer ou Blob), libérée automatiquement. */
export function useBlobUrl(blob: PhotoData | undefined | null): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const next = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'image/jpeg' }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}
