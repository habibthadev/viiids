import * as React from 'react'
import { cx } from '~/components/primitives'
import { useHoverPlate } from '~/lib/motion'

export function RowList({
  children,
  size = 'default',
  className,
  label,
}: {
  children: React.ReactNode
  size?: 'default' | 'sm'
  className?: string
  label?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  useHoverPlate(ref)
  return (
    <div ref={ref} className={cx('rowlist', className)} data-size={size} aria-label={label} role={label ? 'list' : undefined}>
      <div className="rowlist-plate" data-plate aria-hidden="true" />
      <div className="rowlist-inner">{children}</div>
    </div>
  )
}

export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('row', className)} data-row>
      {children}
    </div>
  )
}

export function RowMain({
  children,
  href,
  className,
  onClick,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { href?: string }) {
  const props = { className: cx('row-main', className), onClick, ...rest }
  if (href) {
    return (
      <a {...props} href={href}>
        {children}
      </a>
    )
  }
  return <div {...props}>{children}</div>
}

export function RowLead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx('row-lead', className)}>{children}</span>
}

export function RowThumb({
  src,
  alt = '',
  icon,
  flipId,
}: {
  src?: string | null
  alt?: string
  icon?: React.ReactNode
  flipId?: string
}) {
  return (
    <span className="row-thumb" aria-hidden="true" data-flip-id={flipId}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : (
        <span className="row-lead" style={{ width: '100%', height: '100%' }}>
          {icon}
        </span>
      )}
    </span>
  )
}

export function RowText({ title, desc }: { title: React.ReactNode; desc?: React.ReactNode }) {
  return (
    <span className="row-text">
      <span className="row-title">{title}</span>
      {desc ? (
        <>
          <span className="row-dot" aria-hidden="true" />
          <span className="row-desc">{desc}</span>
        </>
      ) : null}
    </span>
  )
}

export function RowActions({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <span className={cx('row-actions', className)}>{children}</span>
}

export function RowAction({
  children,
  label,
  href,
  onClick,
}: {
  children: React.ReactNode
  label: string
  href?: string
  onClick?: (e: React.MouseEvent) => void
}) {
  if (href) {
    return (
      <a className="row-action tap" href={href} aria-label={label} target="_blank" rel="noreferrer" onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" className="row-action tap" aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}
