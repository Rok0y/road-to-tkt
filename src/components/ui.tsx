import { useEffect, type ReactNode } from 'react'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Sheet({
  title,
  onClose,
  action,
  children,
}: {
  title: string
  onClose: () => void
  action?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <button className="link" style={{ justifySelf: 'start' }} onClick={onClose}>
            Annuler
          </button>
          <h2>{title}</h2>
          <div className="end">{action}</div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="large-title">{title}</h1>
      </div>
      {action}
    </header>
  )
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div style={{ fontSize: 44 }}>{icon}</div>
      <h3>{title}</h3>
      {children}
    </div>
  )
}
