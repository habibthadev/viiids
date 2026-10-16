import { Outlet, createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { VISIBLE_PLATFORMS, isPlatform } from '~/lib/api'

export const Route = createFileRoute('/$platformId')({
  beforeLoad: ({ params }) => {
    if (!isPlatform(params.platformId)) throw notFound()
    if (!VISIBLE_PLATFORMS.includes(params.platformId)) {
      throw redirect({ to: '/$platformId', params: { platformId: 'nkiri' } })
    }
  },
  component: PlatformLayout,
})

function PlatformLayout() {
  const { platformId } = Route.useParams()
  if (!isPlatform(platformId)) throw notFound()
  return <Outlet />
}
