import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/movies')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
  component: () => null,
})
