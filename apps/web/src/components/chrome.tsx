import * as React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, CaretUp, House, MagnifyingGlass, Moon, Rows, SquaresFour, Sun } from '@phosphor-icons/react'
import { ALL_PLATFORMS, fetchPlatforms, VISIBLE_PLATFORMS, type PlatformId } from '~/lib/api'
import { PLATFORM_BLURBS, PLATFORM_LABELS, useAppStore } from '~/store/useAppStore'
import { useTheme } from '~/lib/theme'
import { overlayIn } from '~/lib/motion'
import { cx, Kbd, Label, Tag } from '~/components/primitives'
import { PlatformIcon } from '~/components/MovieCard'
import { Row, RowList, RowMain, RowText } from '~/components/rows'

/* ---------------- wordmark + theme toggle ---------------- */

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('wordmark tap', className)} aria-label="viiids home">
      viiids
    </Link>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      className={cx('iconbtn tap', className)}
      aria-label={`Switch theme — currently ${theme}`}
      title={`Theme: ${theme}`}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  )
}

/* ---------------- rail (desktop sidebar) ---------------- */

export function Rail() {
  return (
    <aside className="rail">
      <nav className="rail-nav" aria-label="Shelves" data-rise>
        <Label>Navigation</Label>
        <RowList size="sm" className="mt-2" label="Shelves">
          <Row>
            <Link to="/" className="row-main">
              <span className="row-lead">
                <House size={13} />
              </span>
              <RowText title="All shelves" desc="the index" />
              <span className="row-meta">05</span>
            </Link>
          </Row>
          {VISIBLE_PLATFORMS.map((p: PlatformId, i) => (
            <Row key={p}>
              <Link to="/$platformId" params={{ platformId: p }} className="row-main">
                <span className="row-lead">
                  <PlatformIcon id={p} size={13} />
                </span>
                <RowText title={PLATFORM_LABELS[p]} desc="browse" />
                <span className="row-meta">{String(i + 1).padStart(2, '0')}</span>
              </Link>
            </Row>
          ))}
        </RowList>
      </nav>

      <div className="rail-shortcut callout" data-rise>
        <p className="rowflex" style={{ gap: '0.4rem' }}>
          <Label className="c-accent">Quick find</Label>
        </p>
        <p className="t-body c-ink2 mt-2 pretty">
          Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> anywhere to search every shelf at once.
        </p>
      </div>
    </aside>
  )
}

/* ---------------- topbar + dock (mobile) ---------------- */

export function TopBar() {
  return (
    <header className="topbar">
      <Wordmark />
      <div className="rowflex" style={{ gap: '0.25rem' }}>
        <ThemeToggle />
      </div>
    </header>
  )
}

export function Dock({ onMenu }: { onMenu: () => void }) {
  const setPalette = useAppStore((s) => s.setPalette)
  const view = useAppStore((s) => s.view)
  const toggleView = useAppStore((s) => s.toggleView)

  return (
    <div className="dock" data-dock>
      <button type="button" className="search-trigger tap" onClick={() => setPalette(true)} aria-label="Search every shelf">
        <MagnifyingGlass size={14} aria-hidden="true" /> Search
      </button>
      <span className="dock-sep" aria-hidden="true" />
      <button type="button" className="iconbtn tap" aria-label="Shelves" onClick={onMenu}>
        <span className="burger" aria-hidden="true">
          <span />
          <span />
        </span>
      </button>
      <button
        type="button"
        className="iconbtn tap"
        aria-label={view === 'list' ? 'Switch to grid view' : 'Switch to list view'}
        onClick={toggleView}
      >
        {view === 'list' ? <SquaresFour size={15} /> : <Rows size={15} />}
      </button>
    </div>
  )
}

/* ---------------- toolbar (desktop) ---------------- */

export function Toolbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const platformsQ = useQuery({ queryKey: ['platforms'], queryFn: fetchPlatforms })
  const setPalette = useAppStore((s) => s.setPalette)
  const view = useAppStore((s) => s.view)
  const set = useAppStore((s) => s.set)

  const current = ALL_PLATFORMS.find((p) => pathname === `/${p}` || pathname.startsWith(`/${p}/`))
  const sourceUrl = platformsQ.data?.find((p) => p.id === current)?.baseUrl

  return (
    <div className="toolbar">
      <button
        type="button"
        className="search-trigger tap wide"
        onClick={() => setPalette(true)}
        aria-label="Search every shelf"
      >
        <MagnifyingGlass size={14} aria-hidden="true" />
        <span className="prompt">Search every shelf…</span>
        <span className="keys" aria-hidden="true">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      {sourceUrl ? (
        <>
          <span className="dock-sep" aria-hidden="true" />
          <a className="btn btn-ghost btn-sm rowflex" style={{ gap: '0.4rem' }} href={sourceUrl} target="_blank" rel="noreferrer">
            Source <ArrowUpRight size={12} />
          </a>
        </>
      ) : null}
      <span className="spacer" />
      <span className="rowflex" style={{ gap: '0.15rem' }}>
        <button
          type="button"
          className={cx('iconbtn tap', view === 'list' && 'active')}
          aria-label="List view"
          aria-pressed={view === 'list'}
          onClick={() => set({ view: 'list' })}
        >
          <Rows size={15} />
        </button>
        <button
          type="button"
          className={cx('iconbtn tap', view === 'grid' && 'active')}
          aria-label="Grid view"
          aria-pressed={view === 'grid'}
          onClick={() => set({ view: 'grid' })}
        >
          <SquaresFour size={15} />
        </button>
      </span>
      <span className="dock-sep" aria-hidden="true" />
      <ThemeToggle />
    </div>
  )
}

/* ---------------- shelves sheet (mobile menu) ---------------- */

export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <Sheet onClose={onClose}>
      <div className="window-head">
        <div>
          <Label>Navigation</Label>
          <p className="t-display mt-2">Shelves</p>
        </div>
        <button type="button" className="iconbtn tap" aria-label="Close" onClick={onClose}>
          <CaretUp size={15} />
        </button>
      </div>
      <div className="window-body" style={{ paddingTop: 0 }}>
        <RowList label="Shelves">
          <Row>
            <Link to="/" className="row-main" onClick={onClose}>
              <span className="row-lead">
                <House size={14} />
              </span>
              <RowText title="All shelves" desc="the index of everything" />
            </Link>
          </Row>
          {VISIBLE_PLATFORMS.map((p: PlatformId, i) => (
            <Row key={p}>
              <Link to="/$platformId" params={{ platformId: p }} className="row-main" onClick={onClose}>
                <span className="row-lead">
                  <PlatformIcon id={p} size={14} />
                </span>
                <RowText title={PLATFORM_LABELS[p]} desc={PLATFORM_BLURBS[p]} />
                <span className="row-meta">{String(i + 1).padStart(2, '0')}</span>
              </Link>
            </Row>
          ))}
        </RowList>
        <p className="t-small c-ink3 mt-4 rowflex" style={{ gap: '0.4rem' }}>
          <Tag tone="accent">Tip</Tag> Use the search in the dock for every shelf at once.
        </p>
      </div>
    </Sheet>
  )
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const winRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    overlayIn(overlayRef.current, winRef.current, 'bottom')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      className="overlay sheet"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={winRef} className="window" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
