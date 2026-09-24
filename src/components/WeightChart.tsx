import { useMemo } from 'react'
import {
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Line } from 'react-chartjs-2'
import type { Entry, ISODate, Program } from '../types'
import { aggregate, planLine, smoothedSeries, type Granularity, type Milestone, type Point } from '../lib/calc'
import { addDays, dayNumber, mondayOf, monthOf, toLocalDate, yearOf } from '../lib/dates'
import { fmtNumber } from '../lib/format'

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend, Filler)

const BLUE = '#007aff'
const ORANGE = '#ff9500'
const GRID = 'rgba(60,60,67,0.10)'
const INK = 'rgba(60,60,67,0.62)'

/** Fenêtre visible par granularité. */
function windowStart(g: Granularity, today: ISODate): ISODate | null {
  if (g === 'day') return addDays(today, -29)
  if (g === 'week') return addDays(mondayOf(today), -7 * 25)
  if (g === 'month') {
    const [y, m] = today.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 - 11, 1))
    return monthOf(d.toISOString().slice(0, 10))
  }
  return null
}

const UNIT: Record<Granularity, 'day' | 'week' | 'month' | 'year'> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
}

const TOOLTIP_TITLE: Record<Granularity, string> = {
  day: 'EEEE d MMMM',
  week: "'Semaine du' d MMM",
  month: 'MMMM yyyy',
  year: 'yyyy',
}

/** Dernier jour de la période commençant à `start` (borne droite de l'axe X). */
function periodEnd(g: Granularity, start: ISODate): ISODate {
  if (g === 'day') return start
  if (g === 'week') return addDays(start, 6)
  if (g === 'month') return addDays(monthOf(addDays(start, 31)), -1)
  return `${start.slice(0, 4)}-12-31`
}

const xy = (pts: Point[]) => pts.map((p) => ({ x: toLocalDate(p.x).getTime(), y: p.y }))

/** Interpole la droite du plan pour la borner à la fenêtre visible. */
function clipLine(line: Point[], from: ISODate, to: ISODate): Point[] {
  if (line.length !== 2) return []
  const [a, b] = line
  const da = dayNumber(a.x)
  const db = dayNumber(b.x)
  const at = (iso: ISODate) => a.y + ((b.y - a.y) * (dayNumber(iso) - da)) / (db - da)
  const start = from > a.x ? from : a.x
  const end = to < b.x ? to : b.x
  if (start > end) return []
  return [
    { x: start, y: at(start) },
    { x: end, y: at(end) },
  ]
}

interface Props {
  program: Program
  entries: Entry[]
  milestones: Milestone[]
  granularity: Granularity
  today: ISODate
}

export function WeightChart({ program, entries, milestones, granularity, today }: Props) {
  const { data, options } = useMemo(() => {
    const first = entries[0]?.date ?? program.startDate
    const periodOf = { day: (d: ISODate) => d, week: mondayOf, month: monthOf, year: yearOf }[granularity]
    const from = windowStart(granularity, today) ?? periodOf(first < program.startDate ? first : program.startDate)
    const to = periodOf(today)
    const axisEnd = periodEnd(granularity, to)
    const visible = entries.filter((e) => e.date >= from)

    const main: Point[] = granularity === 'day' ? smoothedSeries(entries).filter((p) => p.x >= from) : aggregate(visible, granularity)
    const raw: Point[] = granularity === 'day' ? visible.map((e) => ({ x: e.date, y: e.weight })) : []
    const plan = clipLine(planLine(program), from, axisEnd)

    const ys = [...main, ...raw, ...plan].map((p) => p.y)
    const lo = ys.length ? Math.min(...ys) : program.targetWeight
    const hi = ys.length ? Math.max(...ys) : program.startWeight
    const steps = milestones.filter((m) => m.weight >= lo - 1 && m.weight <= hi + 1)

    const datasets: ChartData<'line'>['datasets'] = [
      {
        label: granularity === 'day' ? 'Min 7 jours' : 'Poids (dernière pesée)',
        data: xy(main),
        borderColor: BLUE,
        backgroundColor: 'rgba(0,122,255,0.08)',
        borderWidth: 2,
        fill: 'start',
        tension: 0.25,
        pointRadius: granularity === 'day' ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: BLUE,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
    ]
    if (raw.length) {
      datasets.push({
        label: 'Pesées',
        data: xy(raw),
        showLine: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(0,122,255,0.35)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
      })
    }
    if (plan.length) {
      datasets.push({
        label: 'Plan',
        data: xy(plan),
        borderColor: ORANGE,
        borderWidth: 2,
        borderDash: [6, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
      })
    }
    for (const m of steps) {
      datasets.push({
        label: `Palier ${m.index}`,
        data: xy([
          { x: from, y: m.weight },
          { x: axisEnd, y: m.weight },
        ]),
        borderColor: m.reachedOn ? 'rgba(52,199,89,0.55)' : 'rgba(60,60,67,0.22)',
        borderWidth: 1,
        borderDash: [2, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
      })
    }

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      layout: { padding: { top: 4, right: 4 } },
      scales: {
        x: {
          type: 'time',
          min: toLocalDate(from).getTime(),
          max: toLocalDate(axisEnd).getTime(),
          adapters: { date: { locale: fr } },
          time: {
            unit: UNIT[granularity],
            displayFormats: { day: 'd MMM', week: 'd MMM', month: 'MMM yy', year: 'yyyy' },
          },
          grid: { display: false },
          border: { color: GRID },
          ticks: { color: INK, maxRotation: 0, autoSkipPadding: 14, font: { size: 11 } },
        },
        y: {
          // Au moins 2 kg d'amplitude pour ne pas grossir des variations de 100 g.
          suggestedMin: Math.floor(lo - 1),
          suggestedMax: Math.ceil(hi + 1),
          grid: { color: GRID },
          border: { display: false },
          ticks: {
            color: INK,
            font: { size: 11 },
            maxTicksLimit: 6,
            callback: (v) => fmtNumber(Number(v), Number.isInteger(Number(v)) ? 0 : 1),
          },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            boxWidth: 18,
            color: INK,
            font: { size: 12 },
            filter: (item) => !item.text.startsWith('Palier'),
          },
        },
        tooltip: {
          backgroundColor: 'rgba(28,28,30,0.92)',
          padding: 10,
          cornerRadius: 10,
          displayColors: true,
          boxPadding: 4,
          filter: (item) => !item.dataset.label?.startsWith('Palier') && item.dataset.label !== 'Plan',
          callbacks: {
            title: (items) => {
              const x = items[0]?.parsed.x
              return x == null ? '' : format(new Date(x), TOOLTIP_TITLE[granularity], { locale: fr })
            },
            label: (item) => ` ${item.dataset.label} : ${fmtNumber(item.parsed.y ?? 0)} kg`,
          },
        },
      },
    }
    return { data: { datasets }, options }
  }, [program, entries, milestones, granularity, today])

  return (
    <div style={{ height: 320 }}>
      <Line data={data} options={options} aria-label="Évolution du poids" role="img" />
    </div>
  )
}
