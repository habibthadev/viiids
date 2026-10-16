import * as React from 'react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Numbered section scaffold: 01 — Title — description, dashed floor. */
export function Section({
  num,
  title,
  desc,
  as = 'h2',
  big = false,
  aside,
  children,
  className,
  id,
}: {
  num: string
  title: React.ReactNode
  desc?: React.ReactNode
  as?: 'h1' | 'h2' | 'h3'
  big?: boolean
  aside?: React.ReactNode
  children?: React.ReactNode
  className?: string
  id?: string
}) {
  const Title = as
  return (
    <section className={cx('section', className)} id={id} data-rise>
      <header className={cx('shead', big && 'big')}>
        <span className="num">{num}</span>
        <Title className="title">{title}</Title>
        {desc ? <p className="desc">{desc}</p> : null}
        {aside ? <div className="aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function Tag({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode
  tone?: 'default' | 'accent' | 'solid' | 'plain'
  className?: string
}) {
  return <span className={cx('tag', tone !== 'default' && tone, className)}>{children}</span>
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Label({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { children: React.ReactNode }) {
  return (
    <span className={cx('label', className)} {...rest}>
      {children}
    </span>
  )
}

export function StatusDot({ state }: { state: 'live' | 'down' | 'idle' }) {
  return <span className={cx('dot', state === 'live' && 'live', state === 'down' && 'down')} aria-hidden="true" />
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="stack" style={{ gap: '0.15rem', padding: '0.35rem 0' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div className="row" key={i}>
          <div className="row-main">
            <span className="skel row-thumb" />
            <span className="row-text" style={{ flex: 1 }}>
              <span className="skel" style={{ height: 14, width: `${42 + ((i * 13) % 30)}%` }} />
              <span className="skel" style={{ height: 12, width: `${24 + ((i * 7) % 22)}%` }} />
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: '1.1rem 1.2rem' }} data-rise>
      <p className="t-lead fd c-ink">{title}</p>
      {body ? <p className="t-body c-ink3 mt-2 pretty">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function ErrorCard({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="card" style={{ padding: '1.1rem 1.2rem' }} role="alert" data-rise>
      <p className="t-lead fd c-ink">Shelf unreachable.</p>
      <p className="t-body c-ink3 mt-2 pretty">{message || 'The source stalled. Try once more.'}</p>
      <div className="mt-3">
        <button type="button" className="btn btn-solid" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  )
}
