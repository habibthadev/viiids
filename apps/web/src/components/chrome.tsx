import * as React from 'react'

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="eyebrow-dot" />
      {children}
    </div>
  )
}

export function Badge({ children, soft }: { children: React.ReactNode; soft?: boolean }) {
  return <span className={`badge${soft ? ' soft' : ''}`}>{children}</span>
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="skel" style={{ aspectRatio: '16/10' }} />
      <div style={{ padding: 16 }}>
        <div className="skel" style={{ height: 16, width: '80%' }} />
        <div className="skel mt-16" style={{ height: 12, width: '50%' }} />
      </div>
    </div>
  )
}

export function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="card">
      <strong>Could not load.</strong>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>{message || 'Check the connection, then retry.'}</p>
      <button type="button" className="btn btn-black" onClick={onRetry}>Retry</button>
    </div>
  )
}
