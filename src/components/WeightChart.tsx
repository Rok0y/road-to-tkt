import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  type Plugin,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Entry, ISODate, Program } from '../types'
import { bmi, objectiveRate, projectDate, trendSeries, type Granularity, type Milestone } from '../lib/calc'
import { addDays, todayISO, toLocalDate } from '../lib/dates'
import { fmtDate, fmtNumber } from '../lib/format'

ChartJS.register(LineController, LineElement, PointElement, LinearScale, TimeScale, Filler)

// Palette validée (daltonisme compris) : tendance / points de contrôle / rythme de l'objectif.
const BLUE = '#0a84ff'
const BRONZE = '#b5651d'
const TEAL = '#12a594'
const GRID = 'rgba(60,60,67,0.10)'
const INK = 'rgba(60,60,67,0.62)'
const DAY = 86_400_000
const MIN_SPAN = 10 * DAY // zoom maximal
const MIN_Y_RANGE = 9 // kg : hauteur minimale de l'échelle verticale

/** Largeur de la fenêtre visible et part de futur, par raccourci de zoom (en jours). */
const PRESETS: Record<Exclude<Granularity, 'year'>, { span: number; ahead: number }> = {
  day: { span: 30, ahead: 4 },
  week: { span: 112, ahead: 21 },
  month: { span: 400, ahead: 60 },
}

const ms = (iso: ISODate) => toLocalDate(iso).getTime()
const isoOf = (t: number) => todayISO(new Date(t))

interface Pt {
  x: number
  y: number
}

interface View {
  min: number
  max: number
}

interface Selection {
  t: number
  y: number
  kind: 'trend' | 'projection'
}

interface Marker {
  t: number
  y: number
  label?: string
  emoji?: string
}

interface Props {
  program: Program
  entries: Entry[]
  milestones: Milestone[]
  granularity: Granularity
  today: ISODate
}

/** Taille des points de pesée selon la largeur visible (en jours) : ils s'effacent en zoom arrière. */
function dotSize(spanDays: number) {
  return spanDays <= 45 ? 3.5 : spanDays <= 150 ? 3 : spanDays <= 450 ? 2 : 0
}

/** Premier indice de `pts` (triés) dont x ≥ t. */
function lowerBound(pts: Pt[], t: number) {
  let lo = 0
  let hi = pts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].x < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Graduations de l'axe du temps, calées sur le calendrier (et non sur le bord de la fenêtre)
 * pour qu'elles glissent avec la courbe au lieu de sauter d'un mois à l'autre.
 */
function timeTicks(min: number, max: number): { ticks: number[]; fmt: string } {
  const spanDays = (max - min) / DAY
  const ticks: number[] = []
  if (spanDays <= 60) {
    const step = spanDays <= 35 ? 1 : 2
    const d = new Date(min)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // lundi
    for (; d.getTime() <= max; d.setDate(d.getDate() + 7)) {
      const week = Math.round(d.getTime() / (7 * DAY))
      if (week % step === 0 && d.getTime() >= min) ticks.push(d.getTime())
    }
    return { ticks, fmt: 'dd/MM' }
  }
  const months = spanDays / 30.44
  if (months <= 36) {
    const step = [1, 2, 3, 6].find((s) => months / s <= 6.5) ?? 6
    const d = new Date(min)
    const cursor = new Date(d.getFullYear(), d.getMonth(), 1)
    for (; cursor.getTime() <= max; cursor.setMonth(cursor.getMonth() + 1)) {
      if ((cursor.getFullYear() * 12 + cursor.getMonth()) % step === 0 && cursor.getTime() >= min) ticks.push(cursor.getTime())
    }
    return { ticks, fmt: step >= 3 || spanDays > 420 ? 'MMM yy' : 'MMM' }
  }
  const step = [1, 2, 5].find((s) => months / 12 / s <= 6) ?? 10
  for (let y = new Date(min).getFullYear(); new Date(y, 0, 1).getTime() <= max; y++) {
    if (y % step === 0 && new Date(y, 0, 1).getTime() >= min) ticks.push(new Date(y, 0, 1).getTime())
  }
  return { ticks, fmt: 'yyyy' }
}

export function WeightChart({ program, entries, milestones, granularity, today }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ChartJS<'line', Pt[]> | null>(null)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [offHome, setOffHome] = useState(false)

  // ---------- Séries (indépendantes de la fenêtre) ----------
  const series = useMemo(() => {
    const trend: Pt[] = trendSeries(entries).map((p) => ({ x: ms(p.x), y: p.y }))
    const dots: Pt[] = entries.map((e) => ({ x: ms(e.date), y: e.weight })).sort((a, b) => a.x - b.x)
    const last = trend[trend.length - 1]
    // Rythme de l'objectif : depuis le dernier point de tendance jusqu'à l'objectif.
    let projection: Pt[] = []
    if (last) {
      const lastIso = isoOf(last.x)
      const reach = projectDate(last.y, program.targetWeight, objectiveRate(program), lastIso)
      if (reach && reach > lastIso) projection = [last, { x: ms(reach), y: program.targetWeight }]
    }
    const markers: Marker[] = [
      { t: ms(program.startDate), y: program.startWeight, emoji: '🚀' },
      ...milestones
        .filter((m) => m.reachedOn && m.index < 10)
        .map((m) => ({ t: ms(m.reachedOn!), y: m.weight, label: `${fmtNumber(m.weight)} kg` })),
      { t: ms(program.endDate), y: program.targetWeight, emoji: '🏆' },
    ]
    return { trend, dots, projection, markers }
  }, [entries, milestones, program])

  // ---------- Limites de navigation et vue par défaut de chaque raccourci ----------
  const first = entries.reduce((m, e) => (e.date < m ? e.date : m), program.startDate)
  const bounds = useMemo(() => {
    const lo = ms(addDays(first, -10))
    const hi = Math.max(ms(addDays(program.endDate, 20)), ms(addDays(today, 30)))
    return { lo, hi }
  }, [first, program.endDate, today])

  const home = useMemo<View>(() => {
    if (granularity === 'year') return { min: bounds.lo, max: bounds.hi }
    const z = PRESETS[granularity]
    // Pas de grand vide à gauche : la fenêtre commence au plus tôt une semaine avant les données.
    const max = Math.max(ms(addDays(today, z.ahead)), ms(addDays(first, z.span - 7)))
    return { min: max - z.span * DAY, max }
  }, [granularity, today, first, bounds])

  // ---------- En-tête : point sélectionné, sinon dernier point de tendance ----------
  const latest = series.trend[series.trend.length - 1]
  const shown: Selection | null = selected ?? (latest ? { t: latest.x, y: latest.y, kind: 'trend' } : null)

  // Le moteur d'animation vit hors de React : il lit l'état courant via cette ref.
  const live = useRef({ series, bounds, home, shown })
  live.current = { series, bounds, home, shown }

  // ---------- Moteur : fenêtre, inertie, animation, échelle verticale amortie ----------
  const engine = useRef({
    view: home,
    y: null as { min: number; max: number } | null,
    raf: 0,
    last: 0,
    velocity: 0, // ms de temps par ms réelle (inertie après un glisser)
    anim: null as null | { from: View; to: View; start: number },
    touching: false,
  })

  function clampView(v: View): View {
    const { lo, hi } = live.current.bounds
    const span = Math.min(hi - lo, Math.max(MIN_SPAN, v.max - v.min))
    let min = (v.min + v.max) / 2 - span / 2
    min = Math.min(hi - span, Math.max(lo, min))
    return { min, max: min + span }
  }

  /** Échelle verticale qui cadre ce qui est visible, avec de la marge pour les étiquettes. */
  function yTarget({ min, max }: View) {
    const { series } = live.current
    const ys: number[] = []
    for (const pts of [series.trend, series.dots]) {
      for (let i = lowerBound(pts, min); i < pts.length && pts[i].x <= max; i++) ys.push(pts[i].y)
    }
    for (const m of series.markers) if (m.t >= min && m.t <= max) ys.push(m.y)
    const [a, b] = series.projection
    if (a && b && a.x <= max && b.x >= min) {
      for (const t of [Math.max(a.x, min), Math.min(b.x, max)]) ys.push(a.y + ((b.y - a.y) * (t - a.x)) / (b.x - a.x))
    }
    if (!ys.length) ys.push(program.startWeight, program.targetWeight)
    const lo = Math.min(...ys)
    const hi = Math.max(...ys)
    const pad = Math.max(0.8, (hi - lo) * 0.1)
    let bottom = lo - pad
    let top = hi + pad * 2 // marge haute pour les étiquettes
    // Hauteur minimale : les écarts d'un jour à l'autre restent proportionnés, même en zoom avant.
    const extra = MIN_Y_RANGE - (top - bottom)
    if (extra > 0) {
      bottom -= extra / 2
      top += extra / 2
    }
    return { min: bottom, max: top }
  }

  function frame(now: number) {
    const e = engine.current
    const chart = chartRef.current
    e.raf = 0
    if (!chart) return
    const dt = e.last ? Math.min(48, now - e.last) : 16
    e.last = now
    let busy = false

    if (e.anim) {
      const p = Math.min(1, (now - e.anim.start) / 320)
      const k = 1 - (1 - p) ** 3
      const { from, to } = e.anim
      e.view = { min: from.min + (to.min - from.min) * k, max: from.max + (to.max - from.max) * k }
      if (p < 1) busy = true
      else e.anim = null
    } else if (e.velocity && !e.touching) {
      const before = e.view.min
      e.view = clampView({ min: e.view.min + e.velocity * dt, max: e.view.max + e.velocity * dt })
      e.velocity *= Math.exp(-dt / 325) // décélération façon iOS
      const span = e.view.max - e.view.min
      if (e.view.min === before || Math.abs(e.velocity * 16) < span * 0.0004) e.velocity = 0
      else busy = true
    }
    e.view = clampView(e.view)

    const target = yTarget(e.view)
    if (!e.y) e.y = target
    else {
      const k = 1 - Math.exp(-dt / 90)
      e.y = { min: e.y.min + (target.min - e.y.min) * k, max: e.y.max + (target.max - e.y.max) * k }
      if (Math.abs(target.min - e.y.min) + Math.abs(target.max - e.y.max) > 0.01) busy = true
      else e.y = target
    }

    const range = e.y.max - e.y.min
    const scales = chart.options.scales!
    Object.assign(scales.x!, { min: e.view.min, max: e.view.max })
    Object.assign(scales.y!, { min: e.y.min, max: e.y.max })
    Object.assign(scales.y!.ticks!, { stepSize: [0.5, 1, 2, 5, 10, 20, 50].find((s) => range / s <= 5) ?? 100 })
    chart.update('none')

    if (busy) e.raf = requestAnimationFrame(frame)
    else {
      e.last = 0
      if (!e.touching) {
        const { home } = live.current
        setOffHome(Math.abs(e.view.min - home.min) > DAY / 2 || Math.abs(e.view.max - home.max) > DAY / 2)
      }
    }
  }

  function kick() {
    if (!engine.current.raf) engine.current.raf = requestAnimationFrame(frame)
  }

  function animateTo(to: View) {
    const e = engine.current
    e.velocity = 0
    e.anim = { from: e.view, to: clampView(to), start: performance.now() }
    kick()
  }

  // ---------- Création du graphique (une seule fois) ----------
  useEffect(() => {
    const canvas = canvasRef.current!
    const decorations: Plugin<'line'> = {
      id: 'decorations',
      beforeDatasetsDraw(chart) {
        // Séparateurs de mois (zoom avant) ou d'années (zoom intermédiaire).
        const { ctx, chartArea: area, scales } = chart
        const { min, max } = scales.x
        const spanDays = (max - min) / DAY
        if (spanDays > 800) return
        ctx.save()
        ctx.strokeStyle = 'rgba(10,132,255,0.45)'
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1
        const d = new Date(min)
        const byYear = spanDays > 200
        const cursor = byYear ? new Date(d.getFullYear() + 1, 0, 1) : new Date(d.getFullYear(), d.getMonth() + 1, 1)
        while (cursor.getTime() <= max) {
          const x = Math.round(scales.x.getPixelForValue(cursor.getTime())) + 0.5
          ctx.beginPath()
          ctx.moveTo(x, area.top)
          ctx.lineTo(x, area.bottom)
          ctx.stroke()
          if (byYear) cursor.setFullYear(cursor.getFullYear() + 1)
          else cursor.setMonth(cursor.getMonth() + 1)
        }
        ctx.restore()
      },
      afterDatasetsDraw(chart) {
        const { series, shown } = live.current
        const { ctx, chartArea: area, scales } = chart
        const { min, max } = scales.x
        ctx.save()
        ctx.beginPath()
        ctx.rect(area.left, area.top - 30, area.width, area.height + 30)
        ctx.clip()
        // Les étiquettes qui en chevaucheraient une autre ne sont pas dessinées (zoom arrière).
        const placed: { l: number; r: number; t: number; b: number }[] = []
        const fits = (l: number, r: number, t: number, b: number) => {
          if (placed.some((p) => l < p.r && r > p.l && t < p.b && b > p.t)) return false
          placed.push({ l, r, t, b })
          return true
        }
        for (const m of series.markers) {
          if (m.t < min - DAY || m.t > max + DAY) continue
          const x = scales.x.getPixelForValue(m.t)
          const y = scales.y.getPixelForValue(m.y)
          ctx.beginPath()
          ctx.arc(x, y, 5, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'
          ctx.fill()
          ctx.lineWidth = 2.5
          ctx.strokeStyle = BRONZE
          ctx.stroke()
          ctx.textAlign = 'center'
          const tx = Math.min(area.right - 30, Math.max(area.left + 30, x))
          if (m.emoji) {
            const ex = Math.min(area.right - 12, Math.max(area.left + 12, x))
            if (!fits(ex - 12, ex + 12, y - 34, y - 8)) continue
            ctx.font = '20px -apple-system, system-ui, sans-serif'
            ctx.fillText(m.emoji, ex, y - 12)
          } else if (m.label) {
            ctx.font = '700 13px -apple-system, system-ui, sans-serif'
            const w = ctx.measureText(m.label).width
            if (!fits(tx - w / 2 - 2, tx + w / 2 + 2, y - 26, y - 8)) continue
            ctx.fillStyle = BRONZE
            ctx.lineWidth = 4
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'
            ctx.strokeText(m.label, tx, y - 11)
            ctx.fillText(m.label, tx, y - 11)
          }
        }
        if (shown && shown.t >= min && shown.t <= max) {
          const x = scales.x.getPixelForValue(shown.t)
          const y = scales.y.getPixelForValue(shown.y)
          ctx.strokeStyle = 'rgba(28,28,30,0.35)'
          ctx.lineWidth = 1
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(x, area.top)
          ctx.lineTo(x, area.bottom)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x, y, 6, 0, Math.PI * 2)
          ctx.fillStyle = shown.kind === 'trend' ? BLUE : TEAL
          ctx.fill()
          ctx.lineWidth = 2.5
          ctx.strokeStyle = '#fff'
          ctx.stroke()
        }
        ctx.restore()
      },
    }

    const spanDays = () => (engine.current.view.max - engine.current.view.min) / DAY
    let tickFmt = 'dd/MM'

    const chart = new ChartJS<'line', Pt[]>(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Tendance',
            data: [],
            borderColor: BLUE,
            borderWidth: 2.5,
            cubicInterpolationMode: 'monotone',
            pointRadius: 0,
            fill: 'start',
            backgroundColor: (c) => {
              const area = c.chart.chartArea
              if (!area) return 'rgba(10,132,255,0.2)'
              const g = c.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
              g.addColorStop(0, 'rgba(10,132,255,0.38)')
              g.addColorStop(1, 'rgba(10,132,255,0.10)')
              return g
            },
          },
          {
            label: 'Pesées',
            data: [],
            showLine: false,
            pointRadius: () => dotSize(spanDays()),
            pointBackgroundColor: 'rgba(10,132,255,0.55)',
            pointBorderColor: '#fff',
            pointBorderWidth: () => (dotSize(spanDays()) ? 1 : 0),
          },
          {
            label: "Rythme de l'objectif",
            data: [],
            borderColor: TEAL,
            borderWidth: 2.5,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: 'start',
            backgroundColor: 'rgba(18,165,148,0.16)',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        normalized: true,
        events: [], // gestes gérés à la main (glisser / pincer / toucher)
        layout: { padding: { top: 26, left: 0, right: 0 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            type: 'time',
            adapters: { date: { locale: fr } },
            grid: { color: GRID },
            border: { display: false },
            afterBuildTicks: (scale) => {
              const { ticks, fmt } = timeTicks(scale.min, scale.max)
              tickFmt = fmt
              scale.ticks = ticks.map((value) => ({ value }))
            },
            ticks: {
              color: INK,
              maxRotation: 0,
              autoSkip: false,
              font: { size: 11 },
              callback: (v) => format(Number(v), tickFmt, { locale: fr }),
            },
          },
          y: {
            position: 'right',
            grid: { color: GRID },
            border: { display: false },
            afterFit: (scale) => {
              scale.width = 34 // largeur fixe : la zone de tracé ne bouge pas pendant le défilement
            },
            ticks: {
              color: INK,
              font: { size: 11 },
              includeBounds: false,
              callback: (v) => fmtNumber(Number(v), Number.isInteger(Number(v)) ? 0 : 1),
            },
          },
        },
      },
      plugins: [decorations],
    })
    chartRef.current = chart
    kick()

    // Gestes natifs : empêcher le zoom de la page par pincement (iOS) et gérer la molette / le trackpad.
    const box = boxRef.current!
    const blockPinch = (ev: TouchEvent) => {
      if (ev.touches.length > 1) ev.preventDefault()
    }
    const blockGesture = (ev: Event) => ev.preventDefault()
    const onWheel = (ev: WheelEvent) => {
      const area = chart.chartArea
      const e = engine.current
      const { min, max } = e.view
      const span = max - min
      if (ev.ctrlKey) {
        // Pincement sur trackpad : zoom autour du curseur.
        ev.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left - area.left) / area.width))
        const anchor = min + frac * span
        const next = span * Math.exp(ev.deltaY * 0.01)
        e.view = clampView({ min: anchor - frac * next, max: anchor - frac * next + next })
      } else if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
        ev.preventDefault()
        const shift = (ev.deltaX / area.width) * span
        e.view = clampView({ min: min + shift, max: max + shift })
      } else return
      e.anim = null
      e.velocity = 0
      kick()
    }
    box.addEventListener('touchmove', blockPinch, { passive: false })
    box.addEventListener('gesturestart', blockGesture)
    box.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(engine.current.raf)
      engine.current.raf = 0
      box.removeEventListener('touchmove', blockPinch)
      box.removeEventListener('gesturestart', blockGesture)
      box.removeEventListener('wheel', onWheel)
      chart.destroy()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nouvelles données : on remplace les séries, la fenêtre reste où elle est.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const [trend, dots, projection] = chart.data.datasets
    trend.data = series.trend
    dots.data = series.dots
    projection.data = series.projection
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series])

  // Raccourci de zoom choisi : on y glisse en douceur (sauf au premier affichage).
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setSelected(null)
    animateTo(home)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity])

  // La sélection est dessinée par le plugin : il suffit de redessiner.
  useEffect(() => {
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // ---------- Toucher pour sélectionner ----------
  function select(clientX: number) {
    const chart = chartRef.current
    if (!chart) return
    const rect = chart.canvas.getBoundingClientRect()
    const t = chart.scales.x.getValueForPixel(clientX - rect.left)
    if (t === undefined) return
    const [a, b] = series.projection
    if (a && b && t > a.x && t <= b.x) {
      setSelected({ t, y: a.y + ((b.y - a.y) * (t - a.x)) / (b.x - a.x), kind: 'projection' })
      return
    }
    const pts = series.trend
    if (!pts.length) return
    const i = lowerBound(pts, t)
    const best = i >= pts.length ? pts[pts.length - 1] : i > 0 && t - pts[i - 1].x < pts[i].x - t ? pts[i - 1] : pts[i]
    setSelected({ t: best.x, y: best.y, kind: 'trend' })
  }

  // ---------- Glisser (avec inertie) et pincer pour zoomer ----------
  const gesture = useRef({
    pointers: new Map<number, number>(), // id → clientX
    startX: 0,
    start: home as View,
    anchor: 0, // instant sous le milieu des deux doigts
    dist: 0,
    moved: false,
    stoppedFling: false,
    samples: [] as { at: number; min: number }[],
  })

  function plotX(clientX: number) {
    const chart = chartRef.current!
    const rect = chart.canvas.getBoundingClientRect()
    return (clientX - rect.left - chart.chartArea.left) / chart.chartArea.width
  }

  /** (Re)part d'un état de départ pour le geste en cours, selon le nombre de doigts posés. */
  function beginGesture() {
    const g = gesture.current
    const e = engine.current
    const xs = [...g.pointers.values()]
    g.start = e.view
    g.samples = [{ at: performance.now(), min: e.view.min }]
    if (xs.length >= 2) {
      const [a, b] = xs
      const span = e.view.max - e.view.min
      g.anchor = e.view.min + plotX((a + b) / 2) * span
      g.dist = Math.max(40, Math.abs(a - b))
    } else if (xs.length === 1) {
      g.startX = xs[0]
    }
  }

  const handlers = {
    onPointerDown: (ev: React.PointerEvent<HTMLDivElement>) => {
      if (!chartRef.current) return
      ev.currentTarget.setPointerCapture(ev.pointerId)
      const g = gesture.current
      const e = engine.current
      if (g.pointers.size === 0) {
        g.moved = false
        g.stoppedFling = e.velocity !== 0 || e.anim !== null
      } else g.moved = true // deuxième doigt : ce n'est plus un toucher
      e.velocity = 0
      e.anim = null
      e.touching = true
      g.pointers.set(ev.pointerId, ev.clientX)
      beginGesture()
    },
    onPointerMove: (ev: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current
      const chart = chartRef.current
      if (!g.pointers.has(ev.pointerId) || !chart) return
      g.pointers.set(ev.pointerId, ev.clientX)
      const e = engine.current
      const xs = [...g.pointers.values()]
      const width = chart.chartArea.width
      if (xs.length >= 2) {
        const [a, b] = xs
        const dist = Math.max(40, Math.abs(a - b))
        const span = Math.min(live.current.bounds.hi - live.current.bounds.lo, Math.max(MIN_SPAN, ((g.start.max - g.start.min) * g.dist) / dist))
        const min = g.anchor - plotX((a + b) / 2) * span
        e.view = clampView({ min, max: min + span })
      } else {
        const dx = xs[0] - g.startX
        if (!g.moved && Math.abs(dx) < 6) return
        g.moved = true
        const shift = (-dx / width) * (g.start.max - g.start.min)
        e.view = clampView({ min: g.start.min + shift, max: g.start.max + shift })
        const now = performance.now()
        g.samples.push({ at: now, min: e.view.min })
        while (g.samples.length > 2 && now - g.samples[0].at > 100) g.samples.shift()
      }
      kick()
    },
    onPointerUp: (ev: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current
      if (!g.pointers.has(ev.pointerId)) return
      const wasPinch = g.pointers.size >= 2
      g.pointers.delete(ev.pointerId)
      const e = engine.current
      if (g.pointers.size > 0) {
        beginGesture() // un doigt reste posé après un pincement : on continue en glissant
        return
      }
      e.touching = false
      if (!g.moved && !g.stoppedFling) select(ev.clientX)
      else if (!wasPinch && g.moved) {
        // Lancer : vitesse mesurée sur les ~100 dernières ms.
        const now = performance.now()
        const s = g.samples[0]
        const recent = s && now - g.samples[g.samples.length - 1].at < 60
        if (s && recent && now - s.at > 0) e.velocity = (e.view.min - s.min) / (now - s.at)
      }
      kick()
    },
    onPointerCancel: (ev: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current
      g.pointers.delete(ev.pointerId)
      if (g.pointers.size === 0) {
        engine.current.touching = false
        kick()
      } else beginGesture()
    },
  }

  return (
    <div>
      {shown && (
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div>
            <span className="num" style={{ fontSize: 24, fontWeight: 700 }}>
              {fmtNumber(shown.y)} kg
            </span>
            <span className="small" style={{ marginLeft: 8, fontWeight: 600 }}>
              IMC {fmtNumber(bmi(shown.y, program.heightCm))}
            </span>
          </div>
          <div className="small muted">
            {shown.kind === 'trend' ? 'Tendance' : "Rythme de l'objectif"}, {fmtDate(isoOf(shown.t), 'd MMM yyyy')}
          </div>
        </div>
      )}

      <div
        ref={boxRef}
        {...handlers}
        style={{ height: 300, position: 'relative', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab' }}
      >
        <canvas ref={canvasRef} aria-label="Évolution du poids" role="img" />
      </div>

      <div className="small" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', marginTop: 8 }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, border: `2.5px solid ${BRONZE}`, marginRight: 5, verticalAlign: -1 }} />
          Point de contrôle
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 16, borderTop: `2.5px solid ${BLUE}`, marginRight: 5, verticalAlign: 3 }} />
          Tendance
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 16, borderTop: `2.5px dashed ${TEAL}`, marginRight: 5, verticalAlign: 3 }} />
          Rythme de l'objectif
        </span>
      </div>

      <div className="small muted" style={{ textAlign: 'center', marginTop: 6 }}>
        Glisse pour naviguer, pince pour zoomer
      </div>

      {(offHome || selected) && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            className="link small"
            onClick={() => {
              setSelected(null)
              animateTo(live.current.home)
            }}
          >
            Revenir à aujourd'hui
          </button>
        </div>
      )}
    </div>
  )
}
