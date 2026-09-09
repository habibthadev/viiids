import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import gsap from 'gsap'
import { ArrowRight } from '@phosphor-icons/react'
import { VISIBLE_PLATFORMS, type PlatformId } from '~/lib/api'
import { PLATFORM_BLURBS, PLATFORM_LABELS } from '~/store/useAppStore'
import { TopBar } from '~/components/site'
import { Eyebrow } from '~/components/chrome'
import { PlatformIcon } from '~/components/MovieCard'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  const heroRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!heroRef.current) return
    const ctx = gsap.context(() => {
      gsap.from('[data-hero]', { y: 24, opacity: 0, duration: 0.65, stagger: 0.08, ease: 'power3.out' })
      gsap.from('[data-plat]', { y: 18, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out', delay: 0.15 })
    }, heroRef)
    return () => ctx.revert()
  }, [])

  return (
    <div className="graph-canvas">
      <div className="graph-canvas-fade">
        <TopBar />
        <main id="main" tabIndex={-1} className="page-shell" ref={heroRef} style={{ paddingTop: 72, paddingBottom: 88, outline: 'none' }}>
          <div data-hero>
            <Eyebrow>Pick a shelf</Eyebrow>
            <h1 className="headline display">
              Every shelf. <span className="tone">One search.</span>
            </h1>
            <div className="accent-bar" aria-hidden="true" />
          </div>
          <p className="sub" data-hero style={{ marginBottom: 0 }}>
            One shelf, fully stocked. Choose it to start.
          </p>
          <div className="meta-strip" data-hero>
            <span>05 Shelves</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>Live search</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>Direct files</span>
          </div>

          <div className="plat-grid mt-32">
            {VISIBLE_PLATFORMS.map((p: PlatformId, n) => (
              <Link
                key={p}
                to="/$platformId"
                params={{ platformId: p }}
                className="plat-card"
                data-plat
              >
                <span className="plat-index">0{n + 1}</span>
                <span className="row" style={{ color: 'var(--color-carbon-ink)' }}>
                  <PlatformIcon id={p} size={26} />
                </span>
                <h2 className="plat-name">{PLATFORM_LABELS[p]}</h2>
                <p className="plat-blurb">{PLATFORM_BLURBS[p]}</p>
                <span className="plat-go">Open <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>

          <p className="small muted mt-32" data-plat>
            Files stream from the source sites. viiids stores nothing.
          </p>
        </main>
      </div>
    </div>
  )
}
