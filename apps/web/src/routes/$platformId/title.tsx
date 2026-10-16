import * as React from 'react'
import { Link, createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { ArrowLeft, ArrowUpRight, FilmSlate } from '@phosphor-icons/react'
import { downloadHref, episodeEntries, fetchList, fetchResolve, fetchSearch, fileLabel, type Movie, isPlatform } from '~/lib/api'
import { PLATFORM_LABELS } from '~/store/useAppStore'
import { DownloadPanel, Page } from '~/components/site'
import { ErrorCard, Section, Tag } from '~/components/primitives'
import { TitleRow } from '~/components/controls'
import { Row, RowAction, RowActions, RowList, RowMain, RowText } from '~/components/rows'
import { animateDisclosure } from '~/lib/motion'

export const Route = createFileRoute('/$platformId/title')({
  validateSearch: (s: Record<string, unknown>) =>
    z
      .object({
        mode: z.enum(['list', 'search']).catch('list'),
        q: z.string().max(120).optional(),
        page: z.coerce.number().int().min(1).max(20).catch(1),
        kind: z.enum(['all', 'movie', 'series']).catch('all'),
        i: z.coerce.number().int().min(0).max(500).catch(0),
      })
      .parse(s),
  head: () => ({
    meta: [{ title: 'Title — viiids' }, { name: 'description', content: 'Facts, episodes and an in-site download for this title.' }],
  }),
  component: TitlePage,
})

const platformApi = getRouteApi('/$platformId')

function TitlePage() {
  const { platformId: rawPlatform } = platformApi.useParams()
  if (!isPlatform(rawPlatform)) throw notFound()
  const platform = rawPlatform
  const search = Route.useSearch()
  const isSearch = search.mode === 'search' && !!search.q

  const q = useQuery({
    queryKey: ['title', platform, search.mode, search.q ?? '', search.page, search.kind, search.i],
    queryFn: () =>
      isSearch
        ? fetchSearch({ platform, q: search.q as string, kind: search.kind })
        : fetchList({ platform, page: search.page, kind: search.kind }),
    placeholderData: keepPreviousData,
  })
  const movies = (q.data ?? []) as Movie[]
  const movie = movies[search.i]

  const moreQ = useQuery({
    queryKey: ['more', platform],
    queryFn: () => fetchList({ platform, page: 1 }),
    staleTime: 1000 * 60 * 5,
  })
  const all = (moreQ.data ?? []) as Movie[]
  const more = all.filter((m) => m.DownloadLink !== movie?.DownloadLink).slice(0, 4)
  const indexOf = (dl: string) => Math.max(0, all.findIndex((m) => m.DownloadLink === dl))
  const episodes = movie ? episodeEntries(movie) : []

  const back = (
    <Link to="/$platformId" params={{ platformId: platform }} className="btn btn-ghost btn-sm tap" style={{ marginLeft: '-0.6rem' }}>
      <ArrowLeft size={13} /> {PLATFORM_LABELS[platform]}
    </Link>
  )
  const top = (
    <div className="page-top" data-rise>
      {back}
    </div>
  )

  if (q.isPending && !q.data) {
    return (
      <Page>
        {top}
        <Section num="01" big as="h1" className="flush-top" title={<span className="skel" style={{ display: 'inline-block', width: '12rem', height: '1.6rem' }} />} desc=" ">
          <div className="detail-grid mt-4">
            <div className="skel cover" />
            <div className="stack" style={{ gap: '0.6rem' }}>
              <span className="skel" style={{ height: 14, width: '60%' }} />
              <span className="skel" style={{ height: 14, width: '40%' }} />
              <span className="skel" style={{ height: 90 }} />
            </div>
          </div>
        </Section>
      </Page>
    )
  }

  if (q.isError) {
    return (
      <Page>
        {top}
        <Section num="01" big as="h1" className="flush-top" title="Title" desc="This entry stalled on the way here.">
          <div className="mt-4">
            <ErrorCard message={q.error instanceof Error ? q.error.message : undefined} onRetry={() => q.refetch()} />
          </div>
        </Section>
      </Page>
    )
  }

  if (!movie) {
    return (
      <Page>
        {top}
        <Section num="01" big as="h1" className="flush-top" title="Gone from this shelf." desc="The listing changed under us. Pick something current.">
          <div className="rowflex mt-4">
            <Link to="/$platformId" params={{ platformId: platform }} className="btn btn-solid">
              Back to shelf
            </Link>
            <Link to="/" className="btn btn-outline">
              All shelves
            </Link>
          </div>
        </Section>
      </Page>
    )
  }

  const facts = [
    ['Source', movie.Source || PLATFORM_LABELS[platform]],
    ['Posted', movie.UploadDate || 'Unknown'],
    ['Category', movie.Category],
    ['Cast', movie.Cast],
    ['Tags', movie.Tags],
  ].filter(([, v]) => Boolean(v)) as [string, string][]

  return (
    <Page>
      {top}
      <Section
        num="01"
        big
        as="h1"
        className="flush-top"
        title={
          <>
            {movie.Title} {movie.Year > 0 ? <span className="c-ink3">({movie.Year})</span> : null}
          </>
        }
        desc={movie.Description ? `${movie.Description.slice(0, 110).trimEnd()}${movie.Description.length > 110 ? '…' : ''}` : ' '}
      >
        <div className="detail-grid mt-4">
          <div>
            <figure className="cover">
              {movie.CoverPhotoLink ? (
                <img src={movie.CoverPhotoLink} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              ) : (
                <span className="fallback">
                  <FilmSlate size={34} />
                </span>
              )}
            </figure>
            <div className="rowflex mt-3">
              <Tag tone="solid">{movie.IsSeries ? 'Series' : 'Movie'}</Tag>
              {movie.Quality ? <Tag>{movie.Quality}</Tag> : null}
              {movie.Size ? <Tag>{movie.Size}</Tag> : null}
              {movie.Year > 0 ? <Tag>{movie.Year}</Tag> : null}
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <dl className="ledger">
              {facts.map(([k, v]) => (
                <div className="metarow" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {movie.Description ? (
              <p className="t-lead c-ink2 pretty mt-4" style={{ lineHeight: 1.6 }}>
                {movie.Description.slice(0, 600)}
              </p>
            ) : null}
            <div className="mt-4">
              <DownloadPanel movie={movie} />
            </div>
          </div>
        </div>
      </Section>

      {episodes.length > 0 ? (
        <Section num="02" title="Episodes" desc={`${episodes.length} file${episodes.length === 1 ? '' : 's'} in the pack.`}>
          <RowList label="Episodes">
            {episodes.map((ep) => (
              <EpisodeRow key={ep.key} epKey={ep.key} url={ep.url} />
            ))}
          </RowList>
        </Section>
      ) : null}

      {more.length > 0 ? (
        <Section num={episodes.length > 0 ? '03' : '02'} title="More on this shelf" desc="Fresh picks from the same source.">
          <RowList label="More titles">
            {more.map((m) => (
              <TitleRow
                key={`${m.DownloadLink}-${m.Title}`}
                movie={m}
                platform={platform}
                context={{ mode: 'list', page: 1, i: indexOf(m.DownloadLink) }}
              />
            ))}
          </RowList>
        </Section>
      ) : null}
    </Page>
  )
}

function EpisodeRow({ epKey, url }: { epKey: string; url: string }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [direct, setDirect] = React.useState<string[] | null>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && direct === null && !busy) {
      setBusy(true)
      try {
        const r = await fetchResolve(url)
        setDirect(r.direct.slice(0, 3))
      } catch {
        setDirect([])
      } finally {
        setBusy(false)
      }
    }
  }

  React.useEffect(() => {
    if (panelRef.current) animateDisclosure(panelRef.current, open)
  }, [open])

  return (
    <div>
      <Row>
        <RowMain onClick={() => void toggle()} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            void toggle()
          }
        }}>
          <span className="tag plain">{epKey}</span>
          <RowText title={fileLabel(url)} />
        </RowMain>
        <RowActions>
          <button type="button" className="btn btn-ghost btn-xs tap" onClick={() => void toggle()} disabled={busy}>
            {busy ? (
              <span className="rowflex" style={{ gap: '0.4rem' }}>
                <span className="spin" aria-hidden="true" /> Scan
              </span>
            ) : open ? (
              'Hide'
            ) : (
              'Prepare'
            )}
          </button>
          <RowAction label="Open source page" href={url}>
            <ArrowUpRight size={13} />
          </RowAction>
        </RowActions>
      </Row>
      <div ref={panelRef} className="ep-panel" style={open ? undefined : { height: 0, opacity: 0, overflow: 'hidden' }}>
        {busy ? (
          <p className="t-body c-ink3 ep-files" aria-live="polite">
            Scanning the source…
          </p>
        ) : direct && direct.length === 0 ? (
          <p className="t-body c-ink3 ep-files">
            No direct file — the download sits behind the <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>source page</a>.
          </p>
        ) : (
          <div className="ep-files">
            {(direct ?? []).map((u) => (
              <a key={u} className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start' }} href={downloadHref(u, `${epKey}-${fileLabel(url)}`, url, url)} download>
                <span className="clip mono t-micro">{fileLabel(u)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


