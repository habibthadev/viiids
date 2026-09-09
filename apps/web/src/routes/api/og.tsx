import { createFileRoute } from '@tanstack/react-router'
import { ImageResponse } from '@vercel/og'
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
          const { OgCard, getOgFont } = await import('~/lib/og.server')
          const { title, eyebrow, index, kind } = parsed.data
          const [poppins700, poppins500, jakarta700] = await Promise.all([
            getOgFont('Poppins', 700),
            getOgFont('Poppins', 500),
            getOgFont('Plus Jakarta Sans', 700),
          ])
          return new ImageResponse(OgCard({ title, eyebrow, index, kind }), {
            width: 1200,
            height: 630,
            fonts: [
              { name: 'Poppins', data: poppins700, weight: 700, style: 'normal' },
              { name: 'Poppins', data: poppins500, weight: 500, style: 'normal' },
              { name: 'Plus Jakarta Sans', data: jakarta700, weight: 700, style: 'normal' },
            ],
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
