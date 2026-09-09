import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/thenkiri')({
  beforeLoad: () => {
    throw redirect({ to: '/$platformId', params: { platformId: 'nkiri' } })
  },
  component: () => null,
})
