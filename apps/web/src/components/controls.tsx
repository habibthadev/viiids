import * as React from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  Check,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react'
import { fetchList, fetchSearch, VISIBLE_PLATFORMS, type Movie, type PlatformId } from '~/lib/api'
import { PLATFORM_BLURBS, PLATFORM_LABELS, useAppStore } from '~/store/useAppStore'
import { cx, Kbd, Label, SkeletonRows } from '~/components/primitives'
import { Row, RowAction, RowActions, RowList, RowMain, RowText, RowThumb } from '~/components/rows'
import { PlatformIcon, titleSearch, type TitleContext } from '~/components/MovieCard'
import { overlayIn, popIn } from '~/lib/motion'

/* ---------------- inline search field ---------------- */

export function SearchField({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
}) {
  return (
    <form className="field" role="search" onSubmit={(e) => e.preventDefault()}>
      <span className="lead" aria-hidden="true">
        <MagnifyingGlass size={15} />
      </span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder={placeholder ?? 'Filter this shelf'}
        aria-label={placeholder ?? 'Filter this shelf'}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button type="button" className="iconbtn tap" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={13} />
        </button>
      ) : null}
    </form>
  )
}

/* ---------------- dropdown menu ---------------- */

export interface MenuOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

export function Menu({
  label,
  value,
  options,
  onChange,
  prefix,
}: {
  label: string
  value: string
  options: MenuOption[]
  onChange: (v: string) => void
  prefix?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [hi, setHi] = React.useState(-1)
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 })
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const id = React.useId()
  const current = options.find((o) => o.value === value) ?? null

  const close = (refocus = true) => {
    setOpen(false)
    setHi(-1)
    if (refocus) triggerRef.current?.focus()
  }

  const openMenu = () => {
    const idx = options.findIndex((o) => o.value === value)
    setHi(idx >= 0 ? idx : 0)
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) {
      setPos({
        top: r.bottom + 6 + window.scrollY,
        left: r.left + window.scrollX,
        width: Math.max(r.width, 200),
      })
    }
    setOpen(true)
    requestAnimationFrame(() => {
      popIn(listRef.current)
      listRef.current?.focus()
    })
  }

  const pick = (v: string) => {
    onChange(v)
    close()
  }

  const step = (dir: 1 | -1) => {
    const len = options.length
    let next = hi
    for (let n = 0; n < len; n++) {
      next = (next + dir + len) % len
      if (!options[next]?.disabled) break
    }
    setHi(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    const len = options.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        step(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        step(-1)
        break
      case 'Home':
        e.preventDefault()
        setHi(options.findIndex((o) => !o.disabled))
        break
      case 'End':
        e.preventDefault()
        setHi(len - 1 - [...options].reverse().findIndex((o) => !o.disabled))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (hi >= 0 && hi < len && !options[hi]?.disabled) pick(options[hi].value)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'Tab':
        close(false)
        break
    }
  }

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return
      close(false)
    }
    const onScroll = () => close(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  React.useEffect(() => {
    const idx = options.findIndex((o) => o.value === value)
    if (idx >= 0) setHi(idx)
  }, [value, options])

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-outline btn-sm rowflex tap"
        style={{ gap: '0.4rem' }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? 'select'}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {prefix ? <span className="c-ink3" aria-hidden="true">{prefix}</span> : null}
        <span className="c-ink2" aria-hidden="true">{label}</span>
        <span>{current?.label ?? 'Select'}</span>
        <CaretDown
          size={11}
          weight="bold"
          aria-hidden="true"
          style={{ color: 'var(--ink-3)', transition: `transform var(--dur-hover) var(--ease-out)`, transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open &&
        createPortal(
          <ul
            className="menu"
            role="listbox"
            id={`menu-${id}`}
            aria-label={label}
            ref={listRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{ top: pos.top, left: Math.min(pos.left, window.innerWidth - pos.width - 12), width: pos.width }}
          >
            {options.map((o, i) => (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  disabled={o.disabled}
                  className={cx('menu-opt', i === hi && 'hl')}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o.value)}
                  onKeyDown={onKeyDown}
                  tabIndex={-1}
                  style={o.value === value ? { color: 'var(--ink)' } : undefined}
                >
                  <Check size={13} weight="bold" className="tick" style={{ visibility: o.value === value ? 'visible' : 'hidden' }} aria-hidden="true" />
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {o.hint ? <small>{o.hint}</small> : null}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  )
}

/* ---------------- pagination ---------------- */

export function Pager({
  page,
  busy,
  onPrev,
  onNext,
}: {
  page: number
  busy?: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="rowflex mt-5" style={{ justifyContent: 'center', gap: '0.75rem' }}>
      <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1 || busy} onClick={onPrev}>
        <ArrowLeft size={13} /> Prev
      </button>
      <span className="mono t-small c-ink3 tnum" aria-live="polite">
        page {String(page).padStart(2, '0')}
      </span>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onNext}>
        Next <ArrowRight size={13} />
      </button>
    </div>
  )
}

/* ---------------- title rows (list + grid) ---------------- */

function subline(m: Movie): string {
  const kind = m.IsSeries ? 'Series' : 'Movie'
  return m.Year > 0 ? `${m.Year} · ${kind}` : kind
}

export function TitleRow({ movie, platform, context }: { movie: Movie; platform: PlatformId; context: TitleContext }) {
  return (
    <Row>
      <Link
        to="/$platformId/title"
        params={{ platformId: platform }}
        search={titleSearch(context)}
        className="row-main"
      >
        <RowThumb
          src={movie.CoverPhotoLink || null}
          icon={<PlatformIcon id={platform} size={15} />}
          flipId={`flip-${movie.DownloadLink}`}
        />
        <RowText title={movie.Title} desc={subline(movie)} />
      </Link>
      <RowActions>
        <RowAction label="Open on source" href={movie.DownloadLink} onClick={stopRowNav}>
          <ArrowUpRight size={13} />
        </RowAction>
      </RowActions>
    </Row>
  )
}

function stopRowNav(e: React.MouseEvent) {
  e.stopPropagation()
}

export function TitleTile({
  movie,
  platform,
  context,
  poster = false,
}: {
  movie: Movie
  platform: PlatformId
  context: TitleContext
  poster?: boolean
}) {
  return (
    <Link
      className={cx('tile tap', poster && 'poster')}
      to="/$platformId/title"
      params={{ platformId: platform }}
      search={titleSearch(context)}
    >
      <span className="tile-media" data-flip-id={`flip-${movie.DownloadLink}`}>
        {movie.CoverPhotoLink ? (
          <img src={movie.CoverPhotoLink} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <span className="fallback">
            <PlatformIcon id={platform} size={26} />
          </span>
        )}
        <span className="tile-open" aria-hidden="true">
          <ArrowUpRight size={13} />
        </span>
      </span>
      <span className="tile-title">{movie.Title}</span>
      <span className="tile-sub">{subline(movie)}</span>
    </Link>
  )
}

/* ---------------- search palette (Ctrl K) ---------------- */

function useDebounced<T>(v: T, ms: number): T {
  const [s, setS] = React.useState(v)
  React.useEffect(() => {
    const t = setTimeout(() => setS(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return s
}

export function SearchPalette() {
  const open = useAppStore((s) => s.paletteOpen)
  const setPalette = useAppStore((s) => s.setPalette)
  if (!open) return null
  return <Palette onClose={() => setPalette(false)} />
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const routePlatform = VISIBLE_PLATFORMS.find((p) => pathname === `/${p}` || pathname.startsWith(`/${p}/`))
  const [platform, setPlatform] = React.useState<PlatformId>(routePlatform ?? VISIBLE_PLATFORMS[0])
  const [draft, setDraft] = React.useState('')
  const [hi, setHi] = React.useState(0)
  const q = useDebounced(draft.trim(), 350)
  const searching = q.length > 0

  const resultsQ = useQuery({
    queryKey: ['palette', platform, q],
    queryFn: () => fetchSearch({ platform, q, kind: 'all' }),
    enabled: searching,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 2,
  })
  const results = (resultsQ.data ?? []) as Movie[]
  const shown = results.slice(0, 8)

  React.useEffect(() => {
    setHi(0)
  }, [q, platform])

  const overlayRef = React.useRef<HTMLDivElement>(null)
  const winRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    overlayIn(overlayRef.current, winRef.current, 'top')
    inputRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const go = (m: Movie, i: number) => {
    onClose()
    void navigate({
      to: '/$platformId/title',
      params: { platformId: platform },
      search: { mode: 'search', q, page: 1, kind: 'all', i },
    })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (!shown.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((h) => (h + 1) % shown.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => (h - 1 + shown.length) % shown.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const m = shown[hi]
      if (m) go(m, results.findIndex((r) => r.DownloadLink === m.DownloadLink))
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="overlay top"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={onKeyDown}
    >
      <div ref={winRef} className="palette" role="dialog" aria-modal="true" aria-label="Search every shelf">
        <div className="palette-field">
          <MagnifyingGlass size={17} style={{ color: 'var(--ink-3)', flex: 'none' }} aria-hidden="true" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search every shelf…"
            aria-label="Search every shelf"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="kbd tap" onClick={onClose} aria-label="Close search" style={{ cursor: 'pointer' }}>
            esc
          </button>
        </div>

        <div className="palette-chips" role="radiogroup" aria-label="Shelf">
          {VISIBLE_PLATFORMS.map((p: PlatformId) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={platform === p}
              className="chip tap"
              data-on={platform === p ? '' : undefined}
              onClick={() => setPlatform(p)}
            >
              <PlatformIcon id={p} size={12} /> {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="palette-results">
          {!searching ? (
            <div style={{ padding: '1.4rem 0.75rem' }}>
              <p className="t-body c-ink3 pretty">
                Search {PLATFORM_LABELS[platform]} — titles, movies and series. Results open straight
                on the shelf page.
              </p>
            </div>
          ) : resultsQ.isPending && !resultsQ.data ? (
            <SkeletonRows count={4} />
          ) : resultsQ.isError ? (
            <div style={{ padding: '1rem 0.75rem' }}>
              <p className="t-body c-bad">The shelf did not answer. Try again.</p>
            </div>
          ) : shown.length === 0 ? (
            <div style={{ padding: '1rem 0.75rem' }}>
              <p className="t-body c-ink2">
                Nothing for <strong className="c-ink">{q}</strong> on {PLATFORM_LABELS[platform]}.
              </p>
            </div>
          ) : (
            <RowList label="Search results">
              {shown.map((m, i) => (
                <Row key={`${m.DownloadLink}-${m.Title}`}>
                  <button
                    type="button"
                    className="row-main"
                    style={{ textAlign: 'left' }}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => go(m, results.findIndex((r) => r.DownloadLink === m.DownloadLink))}
                  >
                    <RowThumb src={m.CoverPhotoLink || null} icon={<PlatformIcon id={platform} size={15} />} />
                    <RowText title={m.Title} desc={subline(m)} />
                    <span className="row-meta">{String(i + 1).padStart(2, '0')}</span>
                  </button>
                </Row>
              ))}
            </RowList>
          )}
        </div>

        <div className="palette-foot">
          <span className="hint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="hint">
            <Kbd>↵</Kbd> open
          </span>
          <span className="hint">
            <Kbd>esc</Kbd> close
          </span>
          <span className="spacer" />
          <Label>{searching ? `${results.length} found` : 'every shelf, one search'}</Label>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- landing rows ---------------- */

export function PlatformRow({ id, index, sourceUrl }: { id: PlatformId; index: number; sourceUrl?: string }) {
  return (
    <Row>
      <Link to="/$platformId" params={{ platformId: id }} className="row-main">
        <span className="row-lead c-ink2">
          <PlatformIcon id={id} size={14} />
        </span>
        <RowText title={PLATFORM_LABELS[id]} desc={PLATFORM_BLURBS[id]} />
      </Link>
      <span className="row-meta">{String(index + 1).padStart(2, '0')}</span>
      <RowActions>
        {sourceUrl ? (
          <RowAction label={`Open ${PLATFORM_LABELS[id]} source`} href={sourceUrl}>
            <ArrowUpRight size={13} />
          </RowAction>
        ) : null}
      </RowActions>
    </Row>
  )
}
