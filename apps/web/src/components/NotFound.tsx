import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, House } from '@phosphor-icons/react'
import { VISIBLE_PLATFORMS, type PlatformId } from '~/lib/api'
import { PLATFORM_LABELS } from '~/store/useAppStore'
import { Section } from '~/components/primitives'
import { Page } from '~/components/site'

export function NotFound() {
  const router = useRouter()
  const first = VISIBLE_PLATFORMS[0] as PlatformId
  return (
    <Page>
      <Section
        num="404"
        big
        as="h1"
        title={
          <>
            Lost frame. <span className="c-ink3">Rewind?</span>
          </>
        }
        desc="This path is not on any shelf. The listing may have moved."
      >
        <div className="rowflex">
          <button type="button" className="btn btn-solid tap" onClick={() => router.history.back()}>
            <ArrowLeft size={14} /> Go back
          </button>
          <Link to="/" className="btn btn-outline tap">
            <House size={14} /> All shelves
          </Link>
          <Link to="/$platformId" params={{ platformId: first }} className="btn btn-ghost tap">
            {PLATFORM_LABELS[first]}
          </Link>
        </div>
      </Section>
    </Page>
  )
}
