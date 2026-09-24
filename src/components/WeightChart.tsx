import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { fr } from 'date-fns/locale'
import { Line } from 'react-chartjs-2'
import type { Entry, ISODate, Program } from '../types'
import { bmi, objectiveRate, projectDate, smoothedSeries, type Granularity, type Milestone } from '../lib/calc'
import { addDays, diffDays, todayISO, toLocalDate } from '../lib/dates'
import { fmtDate, fmtNumber } from '../lib/format'

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Filler)

// Palette validée (daltonisme compris) : tendance / points de contrôle / rythme de l'objectif.
const BLUE = '#0a84ff'
const BRONZE = '#b5651d'
const TEAL = '#12a594'
const GRID = 'rgba(60,60,67,0.10)'
const INK = 'rgba(60,60,67,0.62)'
const DAY = 86_400_000

/** Largeur de la fenêtre visible et part de futur, par niveau de zoom (en jours). */
const ZOOM: Record<Exclude<Granularity, 'year'>, { span: number; ahead: number; dot: number }> = {
  day: { span: 30, ahead: 4, dot: 3.5 },
  week: { span: 112, ahead: 21, dot: 3 },
  month: { span: 400, ahead: 60, dot: 2 },
}

const ms = (iso: ISODate) => toLocalDate(iso).getTime()
const isoOf = (t: number) => todayISO(new Date(t))

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

export function WeightChart({ program, entries, milestones, granularity, today }: Props) {
  const chartRef = useRef<ChartJS<'line'>>(null)
  const [shift, setShift] = useState(0) // décalage de la fenêtre, en jours (négatif = passé)
  const [selected, setSelected] = useState<Selection | null>(null)
  const drag = useRef<{ x: number; shift: number; moved: boolean } | null>(null)

  useEffect(() => {
    setShift(0)
    setSelected(null)
  }, [granularity])

  // ---------- Séries (indépendantes de la fenêtre) ----------
  const series = useMemo(() => {
    const trend = smoothedSeries(entries).map((p) => ({ t: ms(p.x), y: p.y }))
    const dots = entries.map((e) => ({ t: ms(e.date), y: e.weight }))
    const last = trend[trend.length - 1]
    // Rythme de l'objectif : depuis le dernier point de tendance jusqu'à l'objectif.
    let projection: { t: number; y: number }[] = []
    if (last) {
      const lastIso = isoOf(last.t)
      const reach = projectDate(last.y, program.targetWeight, objectiveRate(program), lastIso)
      if (reach && reach > lastIso) projection = [last, { t: ms(reach), y: program.targetWeight }]
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

  // ---------- Fenêtre visible ----------
  const first = entries[0]?.date ?? program.startDate
  const origin = first < program.startDate ? first : program.startDate
  const view = useMemo(() => {
    if (granularity === 'year') {
      const end = addDays(program.endDate > today ? program.endDate : today, 20)
      const span = diffDays(origin, end) + 30
      return { span, defaultEnd: ms(end), dot: 0 }
    }
    const z = ZOOM[granularity]
    // Pas de grand vide à gauche : la fenêtre commence au plus tôt une semaine avant les données.
    const end = Math.max(ms(addDays(today, z.ahead)), ms(addDays(origin, z.span - 7)))
    return { span: z.span, defaultEnd: end, dot: z.dot }
  }, [granularity, today, program.endDate, origin])

  // On peut remonter jusqu'au début des données et avancer jusqu'à la date de fin.
  const minShift = Math.min(0, (ms(origin) + view.span * 0.25 * DAY - view.defaultEnd) / DAY)
  const maxShift = Math.max(0, (ms(addDays(program.endDate, 20)) - view.defaultEnd) / DAY)
  const clampShift = (s: number) => Math.min(maxShift, Math.max(minShift, s))
  const xMax = view.defaultEnd + clampShift(shift) * DAY
  const xMin = xMax - view.span * DAY

  // ---------- Échelle verticale : on cadre sur ce qui est visible ----------
  const yRange = useMemo(() => {
    const inView = (p: { t: number }) => p.t >= xMin && p.t <= xMax
    const ys = [...series.trend.filter(inView), ...series.dots.filter(inView), ...series.markers.filter(inView)].map((p) => p.y)
    const [a, b] = series.projection
    if (a && b) {
      for (const t of [Math.max(a.t, xMin), Math.min(b.t, xMax)]) {
        if (t >= a.t && t <= b.t) ys.push(a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t))
      }
    }
    if (!ys.length) ys.push(program.startWeight, program.targetWeight)
    const lo = Math.min(...ys)
    const hi = Math.max(...ys)
    const pad = Math.max(1, (hi - lo) * 0.12)
    const low = lo - pad
    const high = hi + pad * 1.8 // marge haute pour les étiquettes
    // Graduations rondes : au plus 5 intervalles de 1, 2, 5, 10… kg.
    const step = [1, 2, 5, 10, 20, 50].find((s) => (high - low) / s <= 5) ?? 100
    return { min: Math.floor(low / step) * step, max: Math.ceil(high / step) * step, step }
  }, [series, xMin, xMax, program.startWeight, program.targetWeight])

  // ---------- En-tête : point sélectionné, sinon poids affiché du jour ----------
  const latest = series.trend[series.trend.length - 1]
  const shown: Selection | null = selected ?? (latest ? { ...latest, kind: 'trend' } : null)

  function select(clientX: number) {
    const chart = chartRef.current
    if (!chart) return
    const rect = chart.canvas.getBoundingClientRect()
    const t = chart.scales.x.getValueForPixel(clientX - rect.left)
    if (t === undefined) return
    const [a, b] = series.projection
    if (a && b && t > a.t && t <= b.t) {
      setSelected({ t, y: a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t), kind: 'projection' })
      return
    }
    let best = series.trend[0]
    for (const p of series.trend) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
    if (best) setSelected({ ...best, kind: 'trend' })
  }

  // ---------- Glisser pour naviguer, toucher pour sélectionner ----------
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { x: e.clientX, shift: clampShift(shift), moved: false }
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      const chart = chartRef.current
      if (!d || !chart) return
      const dx = e.clientX - d.x
      if (Math.abs(dx) > 6) d.moved = true
      if (d.moved) setShift(clampShift(d.shift - (dx / chart.chartArea.width) * view.span))
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (drag.current && !drag.current.moved) select(e.clientX)
      drag.current = null
    },
    onPointerCancel: () => {
      drag.current = null
    },
  }

  // Le plugin n'est lu qu'à la création du graphique : il lit donc l'état courant via une ref.
  const live = useRef({ granularity, xMin, xMax, markers: series.markers, shown })
  live.current = { granularity, xMin, xMax, markers: series.markers, shown }

  // ---------- Décors : séparateurs de mois, points de contrôle, sélection ----------
  const decorations = useMemo<Plugin<'line'>>(() => ({
    id: 'decorations',
    beforeDatasetsDraw(chart) {
      const { granularity, xMin, xMax } = live.current
      if (granularity === 'year') return
      const { ctx, chartArea: area, scales } = chart
      ctx.save()
      ctx.strokeStyle = 'rgba(10,132,255,0.45)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      const d = new Date(xMin)
      const cursor = granularity === 'month' ? new Date(d.getFullYear() + 1, 0, 1, 12) : new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)
      while (cursor.getTime() <= xMax) {
        const x = scales.x.getPixelForValue(cursor.getTime())
        ctx.beginPath()
        ctx.moveTo(x, area.top)
        ctx.lineTo(x, area.bottom)
        ctx.stroke()
        if (granularity === 'month') cursor.setFullYear(cursor.getFullYear() + 1)
        else cursor.setMonth(cursor.getMonth() + 1)
      }
      ctx.restore()
    },
    afterDatasetsDraw(chart) {
      const { xMin, xMax, markers, shown } = live.current
      const { ctx, chartArea: area, scales } = chart
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
      for (const m of markers) {
        if (m.t < xMin - DAY || m.t > xMax + DAY) continue
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
      if (shown && shown.t >= xMin && shown.t <= xMax) {
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
  }), [])

  const data: ChartData<'line'> = {
    datasets: [
      {
        label: 'Tendance',
        data: series.trend.map((p) => ({ x: p.t, y: p.y })),
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
        data: series.dots.map((p) => ({ x: p.t, y: p.y })),
        showLine: false,
        pointRadius: view.dot,
        pointBackgroundColor: BLUE,
        pointBorderColor: '#fff',
        pointBorderWidth: view.dot ? 1 : 0,
      },
      {
        label: "Rythme de l'objectif",
        data: series.projection.map((p) => ({ x: p.t, y: p.y })),
        borderColor: TEAL,
        borderWidth: 2.5,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: 'start',
        backgroundColor: 'rgba(18,165,148,0.16)',
      },
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    events: [], // gestes gérés à la main (glisser / toucher)
    layout: { padding: { top: 26, left: 0, right: 0 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        type: 'time',
        min: xMin,
        max: xMax,
        adapters: { date: { locale: fr } },
        time: {
          unit: granularity === 'day' ? 'week' : granularity === 'year' && view.span > 900 ? 'year' : 'month',
          isoWeekday: true,
          displayFormats: { week: 'dd/MM', month: granularity === 'year' ? 'MMM yy' : 'MMM', year: 'yyyy' },
        },
        grid: { color: GRID },
        border: { display: false },
        ticks: { color: INK, maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } },
      },
      y: {
        position: 'right',
        min: yRange.min,
        max: yRange.max,
        grid: { color: GRID },
        border: { display: false },
        ticks: { color: INK, font: { size: 11 }, stepSize: yRange.step, callback: (v) => fmtNumber(Number(v), Number.isInteger(Number(v)) ? 0 : 1) },
      },
    },
  }

  const back = Math.abs(clampShift(shift)) > 0.5

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
            {shown.kind === 'trend' ? 'Le plus bas sur 7 jours' : "Rythme de l'objectif"}, {fmtDate(isoOf(shown.t), 'd MMM yyyy')}
          </div>
        </div>
      )}

      <div
        {...handlers}
        style={{ height: 300, position: 'relative', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'grab' }}
      >
        <Line ref={chartRef} data={data} options={options} plugins={[decorations]} aria-label="Évolution du poids" role="img" />
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

      {(back || selected) && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            className="link small"
            onClick={() => {
              setShift(0)
              setSelected(null)
            }}
          >
            Revenir à aujourd'hui
          </button>
        </div>
      )}
    </div>
  )
}
