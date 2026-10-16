import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, House } from '@phosphor-icons/react'
import { Section } from '~/components/primitives'
import { Page } from '~/components/site'

export function DefaultCatchBoundary({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter()
  return (
    <Page>
      <Section
        num="err"
        big
        as="h1"
        title={
          <>
            Stuck frame. <span className="c-ink3">Let’s rewind.</span>
          </>
        }
        desc={error instanceof Error && error.message ? error.message : 'Something failed while drawing this page.'}
      >
        <div className="rowflex" role="alert">
          <button type="button" className="btn btn-solid tap" onClick={() => reset()}>
            Try again
          </button>
          <button type="button" className="btn btn-outline tap" onClick={() => router.history.back()}>
            <ArrowLeft size={14} /> Back
          </button>
          <Link to="/" className="btn btn-ghost tap">
            <House size={14} /> All shelves
          </Link>
        </div>
      </Section>
    </Page>
  )
}
