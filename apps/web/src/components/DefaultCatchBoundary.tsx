import { Link } from '@tanstack/react-router'

export function DefaultCatchBoundary({ error }: { error: unknown }) {
  return (
    <div className="card" style={{ margin: 24 }}>
      <h2>Something went wrong</h2>
      <p className="muted small">{error instanceof Error ? error.message : String(error)}</p>
      <Link to="/" className="link-arrow">
        Back home →
      </Link>
    </div>
  )
}
