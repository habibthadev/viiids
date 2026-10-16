import * as React from 'react'
import { useRouterState } from '@tanstack/react-router'
import { ArrowSquareOut, DownloadSimple, FileArrowDown, MagnifyingGlass } from '@phosphor-icons/react'
import { downloadHref, fetchResolve, fileLabel, type Movie } from '~/lib/api'
import { AlertDialog } from '~/components/Modal'
import { useAppStore } from '~/store/useAppStore'
import { Dock, MenuSheet, Rail, TopBar, Toolbar } from '~/components/chrome'
import { SearchPalette } from '~/components/controls'
import { useRise } from '~/lib/motion'

/** Shared shell: rail (desktop sidebar), toolbar, dock, palette. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const setPalette = useAppStore((s) => s.setPalette)
  const toggleView = useAppStore((s) => s.toggleView)
  const [menu, setMenu] = React.useState(false)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        toggleView()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette, toggleView])

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopBar />
      <div className="frame shell">
        <Rail />
        <div className="maincol">
          <Toolbar />
          <main id="main" tabIndex={-1} style={{ outline: 'none' }} key={pathname}>
            {children}
          </main>
        </div>
      </div>
      <Dock onMenu={() => setMenu(true)} />
      <MenuSheet open={menu} onClose={() => setMenu(false)} />
      <SearchPalette />
    </>
  )
}

/** Wraps a page body: staggers [data-rise] elements once per mount. */
export function Page({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  useRise(ref)
  return (
    <div ref={ref} data-page>
      {children}
    </div>
  )
}

/* ---------------- download flow ---------------- */

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
    <div className="callout" data-rise>
      <div className="rowflex" style={{ justifyContent: 'space-between', gap: '0.75rem' }}>
        <p className="t-lead fd c-ink rowflex" style={{ gap: '0.45rem' }}>
          <DownloadSimple size={16} className="c-accent" aria-hidden="true" /> Download
        </p>
        <span className="tag accent">in-site</span>
      </div>

      {phase === 'idle' ? (
        <p className="t-body c-ink2 mt-2 pretty">
          Scan the source from here — the file streams through this page. No new tabs.
        </p>
      ) : null}
      {phase === 'working' ? (
        <p className="t-body c-ink2 mt-2 rowflex" style={{ gap: '0.5rem' }} role="status">
          <span className="spin" aria-hidden="true" /> Scanning the source…
        </p>
      ) : null}
      {phase === 'failed' ? (
        <p className="t-body c-bad mt-2">Scan failed. Open the source instead.</p>
      ) : null}
      {phase === 'empty' ? (
        <p className="t-body c-ink2 mt-2 pretty">{note || 'No direct file found. Open the source instead.'}</p>
      ) : null}
      {phase === 'ready' ? (
        <div className="stack mt-3" style={{ gap: '0.4rem' }}>
          {direct.map((u) => (
            <a
              key={u}
              className="btn btn-solid btn-sm"
              style={{ justifyContent: 'flex-start' }}
              href={downloadHref(u, movie.Title, pageUrl, pageUrl)}
              download
            >
              <FileArrowDown size={14} /> <span className="clip">{fileLabel(u)}</span>
            </a>
          ))}
          <span className="t-small c-ink3">Big files take a while. Keep the tab open.</span>
        </div>
      ) : null}

      <div className="rowflex mt-3">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void navigator.clipboard?.writeText(pageUrl)}>
          Copy link
        </button>
        {phase === 'ready' ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirm(true)}>
            Source <ArrowSquareOut size={12} />
          </button>
        ) : (
          <button type="button" className="btn btn-solid btn-sm" onClick={prepare} disabled={phase === 'working'}>
            {phase === 'working' ? (
              <>
                <span className="spin" aria-hidden="true" /> Scanning
              </>
            ) : (
              <>
                <MagnifyingGlass size={13} /> Download here
              </>
            )}
          </button>
        )}
        <span className="spacer" />
        <span className="t-micro mono c-ink3">{movie.Source || 'source'}</span>
      </div>

      {confirm ? (
        <AlertDialog
          title="Open the source?"
          body={`This leaves viiids and opens ${pageUrl} in a new tab.`}
          confirmLabel="Continue"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            window.open(pageUrl, '_blank', 'noopener')
            setConfirm(false)
          }}
        />
      ) : null}
    </div>
  )
}
