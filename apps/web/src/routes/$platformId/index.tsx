import * as React from 'react'
import { createFileRoute, getRouteApi, notFound, useNavigate } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { fetchList, fetchSearch, type Movie, isPlatform, type PlatformId } from '~/lib/api'
import { PLATFORM_BLURBS, PLATFORM_LABELS, useAppStore, type ViewMode } from '~/store/useAppStore'
import { Menu, Pager, SearchField, TitleRow, TitleTile } from '~/components/controls'
import { Empty, ErrorCard, Label, Section, SkeletonRows } from '~/components/primitives'
import { Page } from '~/components/site'
import { RowList } from '~/components/rows'
import { captureFlip, playFlip, useIsoLayoutEffect, type FlipState } from '~/lib/motion'

export const Route = createFileRoute('/$platformId/')({
  validateSearch: (s: Record<string, unknown>): { kind?: 'movie' | 'series' } => ({
    kind: s.kind === 'movie' || s.kind === 'series' ? s.kind : undefined,
  }),
  head: ({ params }) => {
    const label = PLATFORM_LABELS[params.platformId as PlatformId] ?? 'Shelf'
    return {
      meta: [
        { title: `${label} shelf — viiids` },
        { name: 'description', content: `Browse ${label} like a reading list. Search, filter, and download in-site.` },
      ],
    }
  },
  component: BrowsePage,
})

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
  const platform: PlatformId = rawPlatform
  const kind = Route.useSearch().kind ?? 'all'
  const navigate = useNavigate({ from: '/$platformId/' })
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
    queryKey: ['list', platform, page, kind],
    queryFn: () => fetchList({ platform, page, kind }),
    enabled: !searching,
    placeholderData: keepPreviousData,
  })
  const searchQ = useQuery({
    queryKey: ['search', platform, debounced, kind],
    queryFn: () => fetchSearch({ platform, q: debounced, kind }),
    enabled: searching && QuerySchema.safeParse(debounced).success,
    placeholderData: keepPreviousData,
  })
  const activeQ = searching ? searchQ : listQ
  const raw: Movie[] = (activeQ.data ?? []) as Movie[]

  const movies = React.useMemo(() => {
    let out = [...raw]
    if (s.sort === 'year-desc') out.sort((a, b) => (b.Year || 0) - (a.Year || 0))
    if (s.sort === 'title-az') out.sort((a, b) => a.Title.localeCompare(b.Title))
    return out
  }, [raw, s.sort])

  // Title links carry the API-order index, so details survive local sorting.
  const apiIndex = (dl: string) => Math.max(0, raw.findIndex((m) => m.DownloadLink === dl))

  /* view flip: capture synchronously when the store flips, animate after paint */
  const flipState = React.useRef<FlipState | null>(null)
  React.useEffect(() => {
    return useAppStore.subscribe((state, prev) => {
      if (state.view !== prev.view) flipState.current = captureFlip('[data-flip-id]')
    })
  }, [])
  useIsoLayoutEffect(() => {
    playFlip(flipState.current, '[data-flip-id]')
    flipState.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.view])

  const switchView = (next: ViewMode) => {
    if (next === s.view) return
    flipState.current = captureFlip('[data-flip-id]')
    s.set({ view: next })
  }

  const submitKind = (k: 'all' | 'movie' | 'series') => {
    setPage(1)
    navigate({ search: k === 'all' ? {} : { kind: k }, replace: true })
  }

  const shown = movies.length
  const statusText = searching
    ? `${shown} match${shown === 1 ? '' : 'es'} for “${debounced}”`
    : `page ${String(page).padStart(2, '0')} · ${shown} titles`

  return (
    <Page>
      <Section
        num="01"
        big
        as="h1"
        title={PLATFORM_LABELS[platform]}
        desc={PLATFORM_BLURBS[platform]}
      >
        <SearchField
          id="shelf-search"
          value={draft}
          onChange={(v) => {
            setDraft(v)
            if (queryError) setQueryError(null)
          }}
          placeholder={`Filter ${PLATFORM_LABELS[platform]}…`}
        />
        {queryError ? <p className="t-body c-bad mt-2">{queryError}</p> : null}

        <div className="rowflex mt-3" style={{ gap: '0.4rem' }}>
          <div className="seg" role="group" aria-label="Kind">
            {(
              [
                ['all', 'Everything'],
                ['movie', 'Movies'],
                ['series', 'Series'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="seg-opt tap"
                aria-pressed={kind === v}
                onClick={() => submitKind(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <Menu
            label="Order"
            value={s.sort}
            onChange={(v) => s.set({ sort: v as typeof s.sort })}
            options={[
              { value: 'relevance', label: 'Top results', hint: 'site order' },
              { value: 'year-desc', label: 'Newest first', hint: 'by year' },
              { value: 'title-az', label: 'Title A to Z', hint: 'alphabet' },
            ]}
          />
          <div className="rowflex" style={{ gap: '0.15rem', marginLeft: 'auto' }} role="group" aria-label="View">
            <button
              type="button"
              className={`iconbtn tap${s.view === 'list' ? ' active' : ''}`}
              aria-label="List view"
              aria-pressed={s.view === 'list'}
              onClick={() => switchView('list')}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path d="M1 3.5h13M1 7.5h13M1 11.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`iconbtn tap${s.view === 'grid' ? ' active' : ''}`}
              aria-label="Grid view"
              aria-pressed={s.view === 'grid'}
              onClick={() => switchView('grid')}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
          <Label className="tnum" role="status">
            {statusText}
          </Label>
        </div>

        <div className="mt-4">
          {activeQ.isPending && !activeQ.data ? <SkeletonRows count={6} /> : null}
          {activeQ.isError && !activeQ.isFetching ? (
            <ErrorCard
              message={activeQ.error instanceof Error ? activeQ.error.message : undefined}
              onRetry={() => activeQ.refetch()}
            />
          ) : null}
          {!activeQ.isPending && !activeQ.isError && movies.length === 0 ? (
            <Empty
              title={searching ? `Nothing for “${debounced}”.` : 'This page is empty.'}
              body="Try another word, another kind, or flip back a page."
            />
          ) : null}

          {movies.length > 0 && s.view === 'list' ? (
            <RowList label="Titles">
              {movies.map((m) => (
                <TitleRow
                  key={`${m.DownloadLink}-${m.Title}`}
                  movie={m}
                  platform={platform}
                  context={
                    searching
                      ? { mode: 'search', q: debounced, kind, i: apiIndex(m.DownloadLink) }
                      : { mode: 'list', page, kind, i: apiIndex(m.DownloadLink) }
                  }
                />
              ))}
            </RowList>
          ) : null}

          {movies.length > 0 && s.view === 'grid' ? (
            <div className="cardgrid">
              {movies.map((m) => (
                <TitleTile
                  key={`${m.DownloadLink}-${m.Title}`}
                  movie={m}
                  platform={platform}
                  context={
                    searching
                      ? { mode: 'search', q: debounced, kind, i: apiIndex(m.DownloadLink) }
                      : { mode: 'list', page, kind, i: apiIndex(m.DownloadLink) }
                  }
                />
              ))}
            </div>
          ) : null}
        </div>

        {!searching && movies.length > 0 ? (
          <Pager
            page={page}
            busy={activeQ.isFetching}
            onPrev={() => setPage(Math.max(1, page - 1))}
            onNext={() => setPage(Math.min(20, page + 1))}
          />
        ) : null}
      </Section>
    </Page>
  )
}
