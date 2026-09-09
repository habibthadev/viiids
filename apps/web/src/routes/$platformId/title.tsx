import * as React from 'react'
import { Link, createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { ArrowLeft, FileArrowDown, FilmSlate } from '@phosphor-icons/react'
import { downloadHref, episodeEntries, fetchList, fetchResolve, fetchSearch, fileLabel, type Movie, isPlatform } from '~/lib/api'
import { PLATFORM_LABELS } from '~/store/useAppStore'
import { DownloadPanel } from '~/components/site'
import { Badge, LoadError } from '~/components/chrome'
import { TitleRow } from '~/components/controls'

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
  const movies = ((q.data ?? []) as Movie[])
  const movie = movies[search.i]

  const moreQ = useQuery({
    queryKey: ['more', platform],
    queryFn: () => fetchList({ platform, page: 1 }),
    staleTime: 1000 * 60 * 5,
  })
  const all = ((moreQ.data ?? []) as Movie[])
  const more = all.filter((m) => m.DownloadLink !== movie?.DownloadLink).slice(0, 4)
  const indexOf = (dl: string) => Math.max(0, all.findIndex((m) => m.DownloadLink === dl))

  return (
    <div>
      <Link to="/$platformId" params={{ platformId: platform }} className="link-arrow">
        <ArrowLeft size={14} /> {PLATFORM_LABELS[platform]}
      </Link>

      {q.isPending && !q.data && (
        <div className="detail-grid mt-16">
          <div className="skel" style={{ aspectRatio: '16/10', borderRadius: 12 }} />
          <div>
            <div className="skel" style={{ height: 28, width: '70%' }} />
            <div className="skel mt-16" style={{ height: 14, width: '40%' }} />
            <div className="skel mt-16" style={{ height: 120 }} />
          </div>
        </div>
      )}
      {q.isError && (
        <div className="mt-16">
          <LoadError message={q.error instanceof Error ? q.error.message : undefined} onRetry={() => q.refetch()} />
        </div>
      )}
      {!q.isPending && !q.isError && !movie && (
        <div className="card mt-16">
          <strong>Gone from this shelf.</strong>
          <p className="muted small" style={{ margin: '4px 0 0' }}>The listing changed. Pick something current.</p>
          <p className="mt-16">
            <Link to="/$platformId" params={{ platformId: platform }} className="btn btn-black">Back to shelf</Link>
          </p>
        </div>
      )}

      {movie && (
        <>
          <div className="eyebrow mt-16">
            <span className="eyebrow-dot" />
            {movie.Source || PLATFORM_LABELS[platform]}
          </div>
          <h1 className="headline section" style={{ overflowWrap: 'anywhere' }}>
            {movie.Title} {movie.Year > 0 && <span className="tone">({movie.Year})</span>}
          </h1>

          <div className="detail-grid mt-24">
            <div>
              <div className="detail-cover">
                {movie.CoverPhotoLink ? (
                  <img src={movie.CoverPhotoLink} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                ) : (
                  <FilmSlate size={40} />
                )}
              </div>
              <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
                <Badge>{movie.IsSeries ? 'Series' : 'Movie'}</Badge>
                {movie.Quality && <Badge soft>{movie.Quality}</Badge>}
                {movie.Size && <Badge soft>{movie.Size}</Badge>}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <table className="meta-table">
                <tbody>
                  <MetaRow k="Source" v={movie.Source || PLATFORM_LABELS[platform]} />
                  <MetaRow k="Posted" v={movie.UploadDate || 'Unknown'} />
                  {movie.Category && <MetaRow k="Category" v={movie.Category} />}
                  {movie.Cast && <MetaRow k="Cast" v={movie.Cast} />}
                  {movie.Tags && <MetaRow k="Tags" v={movie.Tags} />}
                </tbody>
              </table>
              {movie.Description && <p style={{ fontSize: 15, lineHeight: 1.6 }}>{movie.Description.slice(0, 600)}</p>}
              <div className="mt-16">
                <DownloadPanel movie={movie} />
              </div>
            </div>
          </div>

          <EpisodeList title={movie.Title} episodes={episodeEntries(movie)} />

          {more.length > 0 && (
            <section className="mt-32">
              <h2 style={{ fontSize: 22, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
                More <span style={{ color: 'var(--color-slate)' }}>on this shelf.</span>
              </h2>
              <div className="title-list mt-16">
                {more.map((m) => (
                  <TitleRow key={`${m.DownloadLink}-${m.Title}`} movie={m} platform={platform} context={{ mode: 'list', page: 1, i: indexOf(m.DownloadLink) }} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function EpisodeList({ title, episodes }: { title: string; episodes: { key: string; url: string }[] }) {
  if (episodes.length === 0) return null
  return (
    <section className="mt-32">
      <h2 style={{ fontSize: 22, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
        Episodes <span style={{ color: 'var(--color-slate)' }}>({episodes.length}).</span>
      </h2>
      <div className="card mt-16" style={{ padding: 8 }}>
        {episodes.map((ep) => (
          <EpisodeRow key={ep.key} epKey={ep.key} url={ep.url} />
        ))}
      </div>
    </section>
  )
}

function EpisodeRow({ epKey, url }: { epKey: string; url: string }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [direct, setDirect] = React.useState<string[] | null>(null)

  const prepare = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (direct !== null || busy) return
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

  return (
    <div style={{ borderBottom: '1px solid #efefef', padding: '4px 0' }}>
      <div className="list-row" style={{ cursor: 'default' }}>
        <Badge soft>{epKey}</Badge>
        <span className="clip" style={{ flex: 1, fontSize: 14 }}>{fileLabel(url)}</span>
        <button type="button" className="btn btn-black" style={{ padding: '7px 14px', fontSize: 12 }} onClick={prepare} disabled={busy}>
          {busy ? 'Scanning' : open ? 'Hide' : 'Save'}
        </button>
        <a className="link-arrow" href={url} target="_blank" rel="noreferrer">Source</a>
      </div>
      {open && (
        <div style={{ padding: '4px 12px 12px 12px', display: 'grid', gap: 8 }}>
          {busy && <span className="small muted">Scanning source…</span>}
          {!busy && direct !== null && direct.length === 0 && (
            <span className="small muted">No direct file. The file sits behind the source page.</span>
          )}
          {!busy && direct !== null && direct.map((u) => (
            <a key={u} className="btn btn-ghost dl-row" href={downloadHref(u, `${epKey}-${fileLabel(url)}`, url, url)} download>
              <FileArrowDown size={14} /> <span className="clip">{fileLabel(u)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td>{k}</td>
      <td>{v}</td>
    </tr>
  )
}
