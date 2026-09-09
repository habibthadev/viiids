import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, House } from '@phosphor-icons/react'
import { VISIBLE_PLATFORMS } from '~/lib/api'
import { PLATFORM_LABELS } from '~/store/useAppStore'

export function NotFound() {
  const router = useRouter()
  const first = VISIBLE_PLATFORMS[0]
  return (
    <div className="graph-canvas">
      <div className="graph-canvas-fade">
        <main id="main" tabIndex={-1} className="page-shell" style={{ paddingTop: 72, paddingBottom: 88, outline: 'none' }}>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            404
          </div>
          <h1 className="headline display">
            Lost frame. <span className="tone">Rewind?</span>
          </h1>
          <div className="meta-strip">
            <span>No reel here</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>Pick a live one below</span>
          </div>
          <div className="row mt-24" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-black" onClick={() => router.history.back()}>
              <ArrowLeft size={15} /> Go back
            </button>
            <Link to="/" className="btn btn-ghost">
              <House size={15} /> Platforms
            </Link>
            <Link to="/$platformId" params={{ platformId: first }} className="btn btn-ghost">
              {PLATFORM_LABELS[first]} shelf
            </Link>
          </div>
        </main>
      </div>
    </div>
  )
}
