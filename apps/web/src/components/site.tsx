import * as React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  ArrowSquareOut,
  CheckCircle,
  DownloadSimple,
  FileArrowDown,
  List,
  MagnifyingGlass,
  X,
  XCircle,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { VISIBLE_PLATFORMS, downloadHref, fetchPlatforms, fetchResolve, fileLabel, type Movie, type PlatformId } from '~/lib/api'
import { PLATFORM_LABELS } from '~/store/useAppStore'
import { AlertDialog } from '~/components/Modal'
import { Badge } from '~/components/chrome'

export function TopBar() {
  const platformsQ = useQuery({ queryKey: ['platforms'], queryFn: fetchPlatforms })
  const [menuOpen, setMenuOpen] = React.useState(false)

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <List size={20} />
        </button>
        <Link to="/" className="brand">
          <span className="brand-mark">V</span>
          <span className="brand-word">viiids</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <Link to="/" className="nav-link" activeProps={{ className: 'nav-link active' }} activeOptions={{ exact: true }}>
            Platforms
          </Link>
        </nav>
        <div className="topbar-right">
          {platformsQ.isError ? (
            <span className="badge"><XCircle size={14} /> Offline</span>
          ) : (
            <span className="badge"><CheckCircle size={14} /> {platformsQ.data ? platformsQ.data.filter((p) => VISIBLE_PLATFORMS.includes(p.id as PlatformId)).length : VISIBLE_PLATFORMS.length} live</span>
          )}
        </div>
      </header>
      {menuOpen && (
        <>
          <div className="overlay" style={{ background: 'rgba(15,15,15,0.25)' }} onClick={() => setMenuOpen(false)} />
          <aside className="drawer" role="navigation" aria-label="Mobile">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="eyebrow"><span className="eyebrow-dot" /> Menu</span>
              <button type="button" className="icon-btn" style={{ display: 'inline-flex' }} aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <Link to="/" className="side-item" activeProps={{ className: 'side-item active' }} activeOptions={{ exact: true }} onClick={() => setMenuOpen(false)}>
              All platforms
            </Link>
            {VISIBLE_PLATFORMS.map((p: PlatformId) => (
              <Link
                key={p}
                to="/$platformId"
                params={{ platformId: p }}
                className="side-item"
                activeProps={{ className: 'side-item active' }}
                onClick={() => setMenuOpen(false)}
              >
                {PLATFORM_LABELS[p]}
              </Link>
            ))}
          </aside>
        </>
      )}
    </>
  )
}

export function PlatformTabs({ platform }: { platform: PlatformId }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const tab = pathname.endsWith('/movies') ? 'movies' : pathname.endsWith('/series') ? 'series' : 'browse'
  const cls = (t: string) => `pill-tab${tab === t ? ' active' : ''}`
  return (
    <nav className="pill-tabs" aria-label="Sections">
      <Link to="/$platformId" params={{ platformId: platform }} className={cls('browse')} activeOptions={{ exact: true }} activeProps={{ className: 'pill-tab active' }}>
        Browse
      </Link>
      <Link to="/$platformId/movies" params={{ platformId: platform }} className={cls('movies')} activeProps={{ className: 'pill-tab active' }}>
        Movies
      </Link>
      <Link to="/$platformId/series" params={{ platformId: platform }} className={cls('series')} activeProps={{ className: 'pill-tab active' }}>
        Series
      </Link>
    </nav>
  )
}

type DlPhase = 'idle' | 'working' | 'ready' | 'empty' | 'failed'

export function DownloadPanel({ movie }: { movie: Movie }) {
  const [phase, setPhase] = React.useState<DlPhase>('idle')
  const [direct, setDirect] = React.useState<string[]>([])
  const [note, setNote] = React.useState('')
  const [confirm, setConfirm] = React.useState(false)
  const pageUrl = movie.DownloadLink

  React.useEffect(() => {
    setPhase('idle')
    setDirect([])
    setNote('')
    setConfirm(false)
  }, [pageUrl])

  const prepare = async () => {
    if (phase === 'working') return
    setPhase('working')
    try {
      const r = await fetchResolve(pageUrl)
      if (r.direct.length > 0) {
        setDirect(r.direct.slice(0, 5))
        setPhase('ready')
      } else {
        setNote(r.note)
        setPhase('empty')
      }
    } catch {
      setPhase('failed')
    }
  }

  return (
    <div className="panel-ice">
      <strong style={{ fontSize: 16 }}>Download</strong>
      {phase === 'idle' && <p className="muted small" style={{ margin: '6px 0 0' }}>Scan finds the file. You stay here.</p>}
      {phase === 'working' && <p className="small" style={{ margin: '6px 0 0' }}><MagnifyingGlass size={14} /> Scanning source…</p>}
      {phase === 'failed' && <p className="small" style={{ margin: '6px 0 0' }}>Scan failed. Open the source instead.</p>}
      {phase === 'ready' && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {direct.map((u) => (
                  <a key={u} className="btn btn-black dl-row" href={downloadHref(u, movie.Title, pageUrl, pageUrl)} download>
                    <FileArrowDown size={15} /> <span className="clip">{fileLabel(u)}</span>
                  </a>
                ))}
          <span className="small muted">Big files take a while. Keep the tab open.</span>
        </div>
      )}
      {phase === 'empty' && (
        <p className="small muted" style={{ margin: '6px 0 0' }}>{note || 'No direct file found. Open the source instead.'}</p>
      )}
      <div className="row mt-16" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(pageUrl) }}>Copy link</button>
        {phase === 'ready' ? (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
            Source <ArrowSquareOut size={14} />
          </button>
        ) : (
          <button type="button" className="btn btn-black" onClick={prepare} disabled={phase === 'working'}>
            <DownloadSimple size={15} /> {phase === 'working' ? 'Scanning' : 'Download here'}
          </button>
        )}
      </div>
      {confirm && (
        <AlertDialog
          title="Open source?"
          body={`This opens ${pageUrl} in a new tab.`}
          confirmLabel="Continue"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            window.open(pageUrl, '_blank', 'noopener')
            setConfirm(false)
          }}
        />
      )}
    </div>
  )
}

export function PageHero({ eyebrow, title, tone, sub }: { eyebrow: string; title: string; tone: string; sub: string }) {
  return (
    <div>
      <div className="eyebrow" data-hero>
        <span className="eyebrow-dot" />
        {eyebrow}
      </div>
      <h1 className="headline section" data-hero>
        {title} <span className="tone">{tone}</span>
      </h1>
      <p className="sub" data-hero>{sub}</p>
    </div>
  )
}
