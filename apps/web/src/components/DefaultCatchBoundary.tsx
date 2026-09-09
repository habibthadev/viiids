import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, House, WarningCircle } from '@phosphor-icons/react'

export function DefaultCatchBoundary({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter()
  return (
    <div className="graph-canvas">
      <div className="graph-canvas-fade">
        <main id="main" tabIndex={-1} className="page-shell" style={{ paddingTop: 72, paddingBottom: 88, outline: 'none' }}>
          <div className="card" role="alert" style={{ maxWidth: 560 }}>
            <div className="row">
              <WarningCircle size={22} color="#0c76fe" aria-hidden="true" />
              <span className="eyebrow"><span className="eyebrow-dot" /> Error</span>
            </div>
            <h1 className="headline section" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
              Stuck frame. <span className="tone">Let's rewind.</span>
            </h1>
            <p className="muted small">
              {error instanceof Error && error.message ? error.message : 'Something failed while drawing this page.'}
            </p>
            <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-black" onClick={() => reset()}>
                Try again
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => router.history.back()}>
                <ArrowLeft size={15} /> Back
              </button>
              <Link to="/" className="btn btn-ghost">
                <House size={15} /> Home
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
