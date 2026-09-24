import { useMemo, useRef, useState } from 'react'
import { db } from '../db/db'
import { parseWeightCsv, type CsvImport } from '../lib/csv'
import { fmtDate } from '../lib/format'
import type { Entry } from '../types'
import { Sheet } from './ui'

interface Props {
  existing: Entry[]
  onClose: () => void
  onDone: (message: string) => void
}

/** Import de pesées depuis le CSV d'une autre app : fichier ou texte collé, fusion avec l'existant. */
export function ImportSheet({ existing, onClose, onDone }: Props) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const result = useMemo((): { data?: CsvImport; error?: string } => {
    if (!text.trim()) return {}
    try {
      return { data: parseWeightCsv(text) }
    } catch (err) {
      return { error: (err as Error).message }
    }
  }, [text])

  const known = useMemo(() => new Map(existing.map((e) => [e.date, e.weight])), [existing])
  const entries = result.data?.entries ?? []
  const replaced = entries.filter((e) => known.has(e.date) && known.get(e.date) !== e.weight).length
  const added = entries.filter((e) => !known.has(e.date)).length

  async function pick(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setText(await file.text())
  }

  async function run() {
    if (!entries.length) return
    setSaving(true)
    await db.entries.bulkPut(entries)
    onDone(`${entries.length} pesées importées ✓ (${added} nouvelles, ${replaced} mises à jour)`)
  }

  return (
    <Sheet
      title="Importer des pesées"
      onClose={onClose}
      action={
        <button className="link" style={{ fontWeight: 600 }} disabled={!entries.length || saving} onClick={run}>
          Importer
        </button>
      }
    >
      <p className="section-footer" style={{ marginTop: 0 }}>
        Fichier CSV exporté d'une autre app (colonnes « Date » et « Poids »). Les pesées s'ajoutent aux tiennes ; à date
        égale, celle du fichier remplace l'existante.
      </p>

      <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => fileRef.current?.click()}>
        {fileName ? `📄 ${fileName}` : 'Choisir un fichier…'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <p className="section-footer" style={{ textAlign: 'center' }}>
        ou colle le contenu ci-dessous
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setFileName(null)
        }}
        placeholder={'"Date";"Poids (kg)"\n"2026-09-24";"101,9"'}
        rows={6}
        spellCheck={false}
        style={{
          width: '100%',
          border: 0,
          borderRadius: 12,
          padding: 12,
          font: '13px ui-monospace, Menlo, monospace',
          background: 'var(--card)',
          resize: 'vertical',
        }}
      />

      {result.error && <p className="section-footer bad">{result.error}</p>}
      {result.data && (
        <div className="list" style={{ marginTop: 12 }}>
          <div className="row">
            <div className="row-main">Pesées trouvées</div>
            <div className="row-end" style={{ fontWeight: 600 }}>
              {entries.length}
            </div>
          </div>
          {entries.length > 0 && (
            <div className="row">
              <div className="row-main">Période</div>
              <div className="row-end">
                {fmtDate(entries[0].date, 'd MMM')} → {fmtDate(entries[entries.length - 1].date, 'd MMM yyyy')}
              </div>
            </div>
          )}
          <div className="row">
            <div className="row-main">Nouvelles</div>
            <div className="row-end good">{added}</div>
          </div>
          <div className="row">
            <div className="row-main">Remplacent une pesée existante</div>
            <div className="row-end">{replaced}</div>
          </div>
          {result.data.skipped > 0 && (
            <div className="row">
              <div className="row-main">Lignes ignorées (illisibles)</div>
              <div className="row-end muted">{result.data.skipped}</div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
