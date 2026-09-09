import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/trending')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
  component: () => null,
})
