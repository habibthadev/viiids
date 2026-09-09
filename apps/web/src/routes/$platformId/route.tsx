import { Outlet, createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { ALL_PLATFORMS, VISIBLE_PLATFORMS, isPlatform } from '~/lib/api'
import { SITE_URL, ogImage } from '~/lib/api'
import { PLATFORM_LABELS, PLATFORM_TAGLINES } from '~/store/useAppStore'
import { PlatformTabs, TopBar } from '~/components/site'

export const Route = createFileRoute('/$platformId')({
  beforeLoad: ({ params }) => {
    if (!isPlatform(params.platformId)) throw notFound()
    if (!VISIBLE_PLATFORMS.includes(params.platformId)) {
      throw redirect({ to: '/$platformId', params: { platformId: 'nkiri' } })
    }
  },
  head: ({ params }) => {
    const id = params.platformId
    const label = isPlatform(id) ? PLATFORM_LABELS[id] : 'Shelf'
    const tag = isPlatform(id) ? PLATFORM_TAGLINES[id] : (['Shelf', ''] as const)
    const index = String(ALL_PLATFORMS.indexOf(id as (typeof ALL_PLATFORMS)[number]) + 1).padStart(2, '0')
    const title = `${label}: ${tag[0]}`
    return {
      meta: [
        { title },
        { property: 'og:title', content: title },
        { property: 'og:url', content: `${SITE_URL}/${id}` },
        { property: 'og:image', content: ogImage({ title: `${tag[0]} ${tag[1]}`, eyebrow: label, index }) },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
      ],
      links: [{ rel: 'canonical', href: `${SITE_URL}/${id}` }],
    }
  },
  component: PlatformLayout,
})

function PlatformLayout() {
  const { platformId } = Route.useParams()
  if (!isPlatform(platformId)) throw notFound()
  const [line, tone] = PLATFORM_TAGLINES[platformId]
  const index = String(ALL_PLATFORMS.indexOf(platformId) + 1).padStart(2, '0')
  return (
    <div className="graph-canvas">
      <div className="graph-canvas-fade">
        <TopBar />
        <main id="main" tabIndex={-1} className="page-shell" style={{ paddingTop: 48, paddingBottom: 80, outline: 'none' }}>
          <div className="masthead">
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                Shelf {index} · {PLATFORM_LABELS[platformId]}
              </div>
              <h1 className="headline section">
                {line} <span className="tone">{tone}</span>
              </h1>
            </div>
            <span className="mast-index" aria-hidden="true">{index}</span>
          </div>
          <div className="mt-16">
            <PlatformTabs platform={platformId} />
          </div>
          <div className="mt-24">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
