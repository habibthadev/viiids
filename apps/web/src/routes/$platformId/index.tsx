import * as React from 'react'
import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import gsap from 'gsap'
import { WarningCircle } from '@phosphor-icons/react'
import { fetchList, fetchSearch, type Movie, isPlatform } from '~/lib/api'
import { useAppStore, type SortMode } from '~/store/useAppStore'
import { Chip, RowSkeleton, SearchBar, Segmented, TitleRow } from '~/components/controls'
import { Badge, LoadError } from '~/components/chrome'

export const Route = createFileRoute('/$platformId/')({ component: BrowsePage })

const platformApi = getRouteApi('/$platformId')
const QuerySchema = z.string().trim().max(120)

function useDebounced<T>(v: T, ms: number): T {
  const [s, setS] = React.useState(v)
  React.useEffect(() => {
    const t = setTimeout(() => setS(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return s
}

function BrowsePage() {
  const { platformId: rawPlatform } = platformApi.useParams()
  if (!isPlatform(rawPlatform)) throw notFound()
  const platform = rawPlatform
  const s = useAppStore()
  const [draft, setDraft] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [queryError, setQueryError] = React.useState<string | null>(null)
  const debounced = useDebounced(draft.trim(), 450)
  const searching = debounced.length > 0

  React.useEffect(() => {
    setDraft('')
    setPage(1)
    setQueryError(null)
  }, [platform])

  const listQ = useQuery({
    queryKey: ['list', platform, page],
    queryFn: () => fetchList({ platform, page }),
    enabled: !searching,
    placeholderData: keepPreviousData,
  })
  const searchQ = useQuery({
    queryKey: ['search', platform, debounced],
    queryFn: () => fetchSearch({ platform, q: debounced }),
    enabled: searching && QuerySchema.safeParse(debounced).success,
    placeholderData: keepPreviousData,
  })
  const activeQ = searching ? searchQ : listQ
  const raw: Movie[] = (activeQ.data ?? []) as Movie[]

  const movies = React.useMemo(() => {
    let out = [...raw]
    if (s.onlySeries) out = out.filter((m) => m.IsSeries)
    if (s.onlyMovies) out = out.filter((m) => !m.IsSeries)
    if (s.withCover) out = out.filter((m) => !!m.CoverPhotoLink)
    if (s.sort === 'year-desc') out.sort((a, b) => (b.Year || 0) - (a.Year || 0))
    if (s.sort === 'title-az') out.sort((a, b) => a.Title.localeCompare(b.Title))
    return out
  }, [raw, s.onlySeries, s.onlyMovies, s.withCover, s.sort])

  // Title links need the API-order index, so details survive local sorting.
  const linkKind = s.onlySeries ? 'series' : s.onlyMovies ? 'movie' : 'all'
  const apiOrder = React.useMemo(() => {
    if (linkKind === 'series') return raw.filter((m) => m.IsSeries)
    if (linkKind === 'movie') return raw.filter((m) => !m.IsSeries)
    return raw
  }, [raw, linkKind])
  const apiIndex = (dl: string) => Math.max(0, apiOrder.findIndex((m) => m.DownloadLink === dl))

  React.useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    if (els.length) gsap.fromTo(els, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.03, ease: 'power2.out', overwrite: true })
  }, [movies.length, page])

  const submit = () => {
    if (draft.trim() && !QuerySchema.safeParse(draft.trim()).success) {
      setQueryError('Keep queries under 120 characters.')
      return
    }
    setQueryError(null)
    setPage(1)
  }

  return (
    <div>
      <SearchBar
        value={draft}
        onChange={(v) => {
          setDraft(v)
          if (queryError) setQueryError(null)
        }}
        onSubmit={submit}
        placeholder={`Search ${platform} titles`}
      />
      {queryError && <p className="row small" style={{ color: '#b00020' }}><WarningCircle size={14} /> {queryError}</p>}

      <div className="filter-bar mt-16">
        <Segmented<SortMode>
          label="Order"
          value={s.sort}
          onChange={(v) => s.set({ sort: v })}
          options={[
            { value: 'relevance', label: 'Top' },
            { value: 'year-desc', label: 'Newest' },
            { value: 'title-az', label: 'A to Z' },
          ]}
        />
        <div>
          <span className="field-label">Show</span>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Chip on={s.onlyMovies} label="Movies" onToggle={() => s.set({ onlyMovies: !s.onlyMovies, onlySeries: false })} />
            <Chip on={s.onlySeries} label="Series" onToggle={() => s.set({ onlySeries: !s.onlySeries, onlyMovies: false })} />
            <Chip on={s.withCover} label="Covers" onToggle={() => s.set({ withCover: !s.withCover })} />
          </div>
        </div>
      </div>

      <p className="small muted" role="status">
        {searching ? <>Matches for “{debounced}”</> : <>Page {page}</>} · {movies.length} shown
      </p>

      {activeQ.isPending && !activeQ.data && (
        <div className="title-list">
          {Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      )}
      {activeQ.isError && (
        <LoadError message={activeQ.error instanceof Error ? activeQ.error.message : undefined} onRetry={() => activeQ.refetch()} />
      )}
      {!activeQ.isPending && !activeQ.isError && movies.length === 0 && (
        <div className="card"><strong>Nothing here.</strong><p className="muted small" style={{ margin: '4px 0 0' }}>Try another word or shelf.</p></div>
      )}
      {movies.length > 0 && (
        <div className="title-list">
          {movies.map((m) => (
            <TitleRow
              key={`${m.DownloadLink}-${m.Title}`}
              movie={m}
              platform={platform}
              context={searching
                ? { mode: 'search', q: debounced, kind: linkKind, i: apiIndex(m.DownloadLink) }
                : { mode: 'list', page, kind: linkKind, i: apiIndex(m.DownloadLink) }}
            />
          ))}
        </div>
      )}

      {!searching && (
        <div className="row mt-24" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-ghost" disabled={page <= 1 || activeQ.isFetching} onClick={() => setPage(page - 1)}>Prev</button>
          <Badge soft>Page {page}</Badge>
          <button type="button" className="btn btn-ghost" disabled={activeQ.isFetching} onClick={() => setPage(Math.min(20, page + 1))}>Next</button>
        </div>
      )}
    </div>
  )
}
