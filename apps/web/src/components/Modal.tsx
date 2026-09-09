import * as React from 'react'
import { X, WarningCircle } from '@phosphor-icons/react'

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide,
}: {
  title: string
  eyebrow?: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={wide ? { maxWidth: 760 } : undefined}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            {eyebrow && (
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                {eyebrow}
              </div>
            )}
            <h3 style={{ margin: '8px 0 0', fontSize: 22, letterSpacing: '-0.02em' }}>{title}</h3>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <hr className="divider" />
        {children}
      </div>
    </div>
  )
}

export function AlertDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal alert-card" role="alertdialog" aria-modal="true">
        <div className="row">
          <WarningCircle size={22} color="#0c76fe" />
          <strong>{title}</strong>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          {body}
        </p>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-black" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
