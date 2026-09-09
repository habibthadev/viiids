import * as React from 'react'
import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import gsap from 'gsap'
import { WarningCircle } from '@phosphor-icons/react'
import { fetchList, fetchSearch, type Movie, isPlatform } from '~/lib/api'
import { Badge, LoadError } from '~/components/chrome'
import { RowSkeleton, SearchBar, TitleRow } from '~/components/controls'

export const Route = createFileRoute('/$platformId/movies')({ component: MoviesPage })

const platformApi = getRouteApi('/$platformId')

function MoviesPage() {
  const { platformId: rawPlatform } = platformApi.useParams()
  if (!isPlatform(rawPlatform)) throw notFound()
  const platform = rawPlatform
  const [draft, setDraft] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [queryError, setQueryError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setDraft('')
    setPage(1)
  }, [platform])

  const q = draft.trim()
  const searching = q.length > 0
  const listQ = useQuery({
    queryKey: ['movies', platform, page],
    queryFn: () => fetchList({ platform, page, kind: 'movie' }),
    enabled: !searching,
    placeholderData: keepPreviousData,
  })
  const searchQ = useQuery({
    queryKey: ['movies-search', platform, q],
    queryFn: () => fetchSearch({ platform, q, kind: 'movie' }),
    enabled: searching,
    placeholderData: keepPreviousData,
  })
  const activeQ = searching ? searchQ : listQ
  const movies = ((activeQ.data ?? []) as Movie[]).filter((m) => !m.IsSeries)

  React.useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]')
    if (els.length) gsap.fromTo(els, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.03, ease: 'power2.out', overwrite: true })
  }, [movies.length, page])

  return (
    <div>
      <SearchBar
        value={draft}
        onChange={(v) => {
          setDraft(v)
          if (queryError) setQueryError(null)
        }}
        onSubmit={() => {
          if (q && q.length > 120) {
            setQueryError('Keep queries under 120 characters.')
            return
          }
          setQueryError(null)
          setPage(1)
        }}
        placeholder="Search movies"
      />
      {queryError && <p className="row small" style={{ color: '#b00020' }}><WarningCircle size={14} /> {queryError}</p>}
      <p className="small muted">{searching ? <>Matches for “{q}”</> : <>Page {page}</>} · {movies.length} shown</p>

      {activeQ.isPending && !activeQ.data && (
        <div className="title-list">
          {Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}
        </div>
      )}
      {activeQ.isError && (
        <LoadError message={activeQ.error instanceof Error ? activeQ.error.message : undefined} onRetry={() => activeQ.refetch()} />
      )}
      {!activeQ.isPending && !activeQ.isError && movies.length === 0 && (
        <div className="card"><strong>No movies here.</strong><p className="muted small" style={{ margin: '4px 0 0' }}>Try another word or shelf.</p></div>
      )}
      {movies.length > 0 && (
        <div className="title-list">
          {movies.map((m, i) => (
            <TitleRow
              key={`${m.DownloadLink}-${m.Title}`}
              movie={m}
              platform={platform}
              context={searching ? { mode: 'search', q, kind: 'movie', i } : { mode: 'list', page, kind: 'movie', i }}
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
