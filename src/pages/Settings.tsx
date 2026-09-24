import { useEffect, useRef, useState } from 'react'
import type { Entry, Program } from '../types'
import { clearAll, saveProgram } from '../db/db'
import { buildBackup, restoreBackup, shareOrDownload } from '../db/backup'
import { PageHeader } from '../components/ui'
import { ImportSheet } from '../components/ImportSheet'
import { addDays, todayISO } from '../lib/dates'
import { fmtNumber, parseDecimal } from '../lib/format'
import { endDateForRate, rateForEndDate } from '../lib/calc'

interface Props {
  program: Program | null
  entries: Entry[]
  onDemo: () => Promise<void>
}

interface Form {
  heightCm: string
  startDate: string
  endDate: string
  startWeight: string
  targetWeight: string
  rate: string // déduit de la date de fin, et inversement
}

/** Recalcule le rythme à partir de la date de fin (vide si les champs ne le permettent pas encore). */
function rateOf(f: Form): string {
  const start = parseDecimal(f.startWeight)
  const target = parseDecimal(f.targetWeight)
  if (start === null || target === null || !f.startDate || !f.endDate) return ''
  const rate = rateForEndDate(start, target, f.startDate, f.endDate)
  return rate ? fmtNumber(rate, 2) : ''
}

/** Sans programme, on part de la première pesée connue (ex. données importées). */
function toForm(p: Program | null, first?: Entry): Form {
  const start = p?.startDate ?? first?.date ?? todayISO()
  const form: Form = {
    heightCm: p ? String(p.heightCm) : '',
    startDate: start,
    endDate: p?.endDate ?? addDays(start, 7 * 26),
    startWeight: p ? fmtNumber(p.startWeight) : first ? fmtNumber(first.weight) : '',
    targetWeight: p ? fmtNumber(p.targetWeight) : '',
    rate: '',
  }
  return { ...form, rate: rateOf(form) }
}

/** Date de fin et rythme sont liés : modifier l'un recalcule l'autre. */
function linked(f: Form, changed: keyof Form): Form {
  if (changed === 'rate') {
    const rate = parseDecimal(f.rate)
    const start = parseDecimal(f.startWeight)
    const target = parseDecimal(f.targetWeight)
    const end = rate && start !== null && target !== null ? endDateForRate(start, target, f.startDate, rate) : null
    return end ? { ...f, endDate: end } : f
  }
  if (changed === 'heightCm') return f
  return { ...f, rate: rateOf(f) }
}

export function Settings({ program, entries, onDemo }: Props) {
  const entryCount = entries.length
  const first = entries[0]
  const [form, setForm] = useState<Form>(() => toForm(program, first))
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setForm(toForm(program, first))
  }, [program, first])
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${fmtNumber(e.usage / 1024 / 1024)} Mo utilisés`)
    })
  }, [entryCount])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => linked({ ...f, [k]: e.target.value }, k))

  const parsed = {
    heightCm: parseDecimal(form.heightCm),
    startWeight: parseDecimal(form.startWeight),
    targetWeight: parseDecimal(form.targetWeight),
    rate: parseDecimal(form.rate),
  }
  const errors: string[] = []
  if (!parsed.heightCm || parsed.heightCm < 100 || parsed.heightCm > 250) errors.push('Taille entre 100 et 250 cm')
  if (!parsed.startWeight || parsed.startWeight < 20) errors.push('Poids de départ invalide')
  if (!parsed.targetWeight || parsed.targetWeight < 20) errors.push('Objectif invalide')
  if (parsed.startWeight && parsed.targetWeight && parsed.startWeight === parsed.targetWeight) errors.push("L'objectif doit différer du départ")
  if (!parsed.rate || parsed.rate <= 0) errors.push('Rythme visé invalide')
  if (!form.startDate || !form.endDate || form.endDate <= form.startDate) errors.push('La date de fin doit suivre la date de début')

  async function save() {
    if (errors.length) return
    await saveProgram({
      heightCm: parsed.heightCm!,
      startDate: form.startDate,
      endDate: form.endDate,
      startWeight: parsed.startWeight!,
      targetWeight: parsed.targetWeight!,
    })
    setStatus('Programme enregistré ✓')
  }

  async function exportData() {
    setStatus('Préparation de la sauvegarde…')
    try {
      await shareOrDownload(await buildBackup())
      setStatus('Sauvegarde exportée ✓')
    } catch (err) {
      setStatus(`Export impossible : ${(err as Error).message}`)
    }
  }

  async function importData(file: File | undefined) {
    if (!file) return
    if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return
    try {
      const r = await restoreBackup(file)
      setStatus(`Sauvegarde restaurée ✓ (${r.entries} pesées, ${r.photos} photos)`)
    } catch (err) {
      setStatus(`Import impossible : ${(err as Error).message}`)
    }
  }

  // Sans programme, le formulaire pré-rempli est enregistrable tel quel.
  const dirty = !program || JSON.stringify(form) !== JSON.stringify(toForm(program))
  const touched = JSON.stringify(form) !== JSON.stringify(toForm(program, first))

  return (
    <div className="page">
      <PageHeader eyebrow="Configuration" title="Réglages" />

      <h2 className="section-title" style={{ marginTop: 0 }}>
        Programme
      </h2>
      <div className="list">
        <Field id="h" label="Taille" unit="cm" value={form.heightCm} onChange={set('heightCm')} numeric />
        <Field id="sw" label="Poids de départ" unit="kg" value={form.startWeight} onChange={set('startWeight')} numeric />
        <Field id="sd" label="Date de début" type="date" value={form.startDate} onChange={set('startDate')} />
        <Field id="tw" label="Objectif" unit="kg" value={form.targetWeight} onChange={set('targetWeight')} numeric />
        <Field id="ed" label="Date de fin" type="date" value={form.endDate} onChange={set('endDate')} />
        <Field id="tr" label="Rythme visé" unit="kg/sem" value={form.rate} onChange={set('rate')} numeric />
      </div>
      <p className="section-footer">Date de fin et rythme visé sont liés : modifier l'un recalcule l'autre.</p>
      {errors.length > 0 && touched && <p className="section-footer bad">{errors[0]}</p>}
      <button className="btn" style={{ marginTop: 12 }} disabled={errors.length > 0 || !dirty} onClick={save}>
        {program ? 'Enregistrer les modifications' : 'Créer mon programme'}
      </button>

      {status && (
        <p className="section-footer" role="status" style={{ textAlign: 'center' }}>
          {status}
        </p>
      )}

      <h2 className="section-title">Sauvegarde</h2>
      <div className="list">
        <button className="row link" onClick={exportData}>
          Exporter mes données
        </button>
        <button className="row link" onClick={() => fileRef.current?.click()}>
          Importer une sauvegarde…
        </button>
        <button className="row link" onClick={() => setImporting(true)}>
          Importer des pesées (CSV d'une autre app)…
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => {
        importData(e.target.files?.[0])
        e.target.value = ''
      }} />
      <p className="section-footer">
        Tes données restent uniquement sur cet appareil{usage ? ` (${usage})` : ''}. Exporte régulièrement vers Fichiers / iCloud Drive :
        c'est aussi le moyen de passer de l'iPhone à l'iPad.
      </p>

      <h2 className="section-title">Données</h2>
      <div className="list">
        {entryCount === 0 && (
          <button className="row link" onClick={() => onDemo().then(() => setStatus('Données de démo chargées ✓'))}>
            Charger des données de démo
          </button>
        )}
        <button
          className="row"
          style={{ color: 'var(--red)' }}
          onClick={async () => {
            if (!confirm('Effacer définitivement le programme, toutes les pesées et toutes les photos ?')) return
            await clearAll()
            setStatus('Toutes les données ont été effacées.')
          }}
        >
          Effacer toutes les données
        </button>
      </div>

      {importing && (
        <ImportSheet
          existing={entries}
          onClose={() => setImporting(false)}
          onDone={(message) => {
            setImporting(false)
            setStatus(program ? message : `${message} — complète maintenant ton programme ci-dessus.`)
            window.scrollTo(0, 0)
          }}
        />
      )}

      <h2 className="section-title">Installer sur iPhone / iPad</h2>
      <div className="card small">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
          <li>Ouvre cette page dans <strong>Safari</strong>.</li>
          <li>
            Touche <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong>.
          </li>
          <li>Lance l'app depuis son icône : elle fonctionne hors connexion.</li>
        </ol>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  unit,
  numeric,
  type = 'text',
  value,
  onChange,
}: {
  id: string
  label: string
  unit?: string
  numeric?: boolean
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} inputMode={numeric ? 'decimal' : undefined} value={value} onChange={onChange} placeholder="—" />
      {unit && <span className="unit">{unit}</span>}
    </div>
  )
}
