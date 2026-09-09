import { Link } from '@tanstack/react-router'

export function NotFound() {
  return (
    <div className="page-shell" style={{ paddingTop: 80 }}>
      <div className="eyebrow">
        <span className="eyebrow-dot" />
        404
      </div>
      <h1 className="headline section">
        Lost frame. <span className="tone">Back to the reel.</span>
      </h1>
      <p>
        <Link to="/" className="link-arrow">
          Go home →
        </Link>
      </p>
    </div>
  )
}
