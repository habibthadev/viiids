import * as React from 'react'
import { createPortal } from 'react-dom'
import { WarningCircle, X } from '@phosphor-icons/react'
import { overlayIn } from '~/lib/motion'

function Frame({
  children,
  onClose,
  wide,
  variant = 'center',
}: {
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
  variant?: 'center' | 'sheet'
}) {
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const winRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    overlayIn(overlayRef.current, winRef.current, variant === 'sheet' ? 'bottom' : 'center')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, variant])

  return createPortal(
    <div
      ref={overlayRef}
      className={`overlay${variant === 'sheet' ? ' sheet' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={winRef}
        className="window"
        role="dialog"
        aria-modal="true"
        style={wide ? { maxWidth: '36rem' } : undefined}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide,
  variant,
}: {
  title: React.ReactNode
  eyebrow?: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
  variant?: 'center' | 'sheet'
}) {
  return (
    <Frame onClose={onClose} wide={wide} variant={variant}>
      <div className="window-head">
        <div style={{ minWidth: 0 }}>
          {eyebrow ? <span className="label">{eyebrow}</span> : null}
          <p className="t-display mt-2" style={{ overflowWrap: 'anywhere' }}>
            {title}
          </p>
        </div>
        <button type="button" className="iconbtn tap" onClick={onClose} aria-label="Close dialog">
          <X size={15} />
        </button>
      </div>
      <div className="window-body">{children}</div>
    </Frame>
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
    <Frame onClose={onCancel}>
      <div className="window-body">
        <div className="rowflex" style={{ gap: '0.6rem' }}>
          <WarningCircle size={19} style={{ color: 'var(--accent-ink)' }} aria-hidden="true" />
          <p className="t-lead fd c-ink">{title}</p>
        </div>
        <p className="t-body c-ink2 mt-3 pretty">{body}</p>
        <div className="rowflex mt-4" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-solid btn-sm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Frame>
  )
}
