import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

export const Route = createFileRoute('/api/og')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const parsed = Params.safeParse(Object.fromEntries(url.searchParams.entries()))
        if (!parsed.success) {
          return new Response('bad query', { status: 400 })
        }
        try {
          const { renderOg } = await import('~/lib/og.server')
          const png = await renderOg(parsed.data)
          return new Response(png as unknown as BodyInit, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400, s-maxage=86400',
            },
          })
        } catch (e) {
          return new Response(`og failed: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 })
        }
      },
    },
  },
})

const Params = z.object({
  title: z.string().max(90).default('viiids'),
  eyebrow: z.string().max(30).default('SHELF'),
  index: z.string().max(4).optional().default(''),
  kind: z.enum(['movie', 'series', 'all']).optional().default('all'),
})
