import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, MagnifyingGlass } from '@phosphor-icons/react'
import { fetchList, fetchPlatforms, VISIBLE_PLATFORMS, type PlatformId } from '~/lib/api'
import { PLATFORM_LABELS, useAppStore } from '~/store/useAppStore'
import { Page } from '~/components/site'
import { Kbd, Section } from '~/components/primitives'
import { PlatformRow, TitleTile } from '~/components/controls'
import { RowList } from '~/components/rows'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'viiids: every shelf, one search' }] }),
  component: LandingPage,
})

const FEATURED: PlatformId = VISIBLE_PLATFORMS[0]

function LandingPage() {
  const platformsQ = useQuery({ queryKey: ['platforms'], queryFn: fetchPlatforms, retry: 1 })
  const setPalette = useAppStore((s) => s.setPalette)
  const baseUrls = React.useMemo(
    () => Object.fromEntries((platformsQ.data ?? []).map((p) => [p.id, p.baseUrl])) as Record<string, string>,
    [platformsQ.data],
  )

  const freshQ = useQuery({
    queryKey: ['list', FEATURED, 1, 'all'],
    queryFn: () => fetchList({ platform: FEATURED, page: 1, kind: 'all' }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  const fresh = React.useMemo(() => (freshQ.data ?? []).slice(0, 6), [freshQ.data])

  return (
    <Page>
      <Section
        num="01"
        big
        as="h1"
        title="Movies & series, one search."
        desc="Every shelf in one index — find a title, check its size and year, and download it in-site."
      >
        <button
          type="button"
          className="search-hero tap"
          onClick={() => setPalette(true)}
          aria-label="Search every shelf"
        >
          <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
          <span className="prompt">Search movies, series, episodes…</span>
          <span className="keys" aria-hidden="true">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <p className="t-small c-ink3 mt-2">Try a title, a year, or “S01E04”.</p>
      </Section>

      <Section
        num="02"
        title="Fresh on the shelf"
        desc={`Newest uploads on ${PLATFORM_LABELS[FEATURED]}.`}
        aside={
          <Link to="/$platformId" params={{ platformId: FEATURED }} className="btn btn-outline btn-sm tap">
            Open {PLATFORM_LABELS[FEATURED]} <ArrowUpRight size={12} />
          </Link>
        }
      >
        {freshQ.isPending && !freshQ.data ? (
          <div className="cardgrid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="tile poster" key={i}>
                <span className="tile-media skel" />
                <span className="skel" style={{ height: 13, width: '82%' }} />
                <span className="skel" style={{ height: 10, width: '46%' }} />
              </div>
            ))}
          </div>
        ) : fresh.length > 0 ? (
          <div className="cardgrid">
            {fresh.map((m, i) => (
              <TitleTile
                key={`${m.DownloadLink}-${m.Title}`}
                movie={m}
                platform={FEATURED}
                poster
                context={{ mode: 'list', page: 1, kind: 'all', i }}
              />
            ))}
          </div>
        ) : (
          <p className="t-body c-ink3 pretty">
            The shelf is quiet right now — open {PLATFORM_LABELS[FEATURED]} to browse anyway.
          </p>
        )}
      </Section>

      <Section
        num="03"
        title="Shelves"
        desc="One index across every platform — sizes, years and facts at a glance."
      >
        <RowList label="Shelves">
          {VISIBLE_PLATFORMS.map((p: PlatformId, i) => (
            <PlatformRow key={p} id={p} index={i} sourceUrl={baseUrls[p]} />
          ))}
        </RowList>
      </Section>
    </Page>
  )
}
