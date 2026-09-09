/// <reference types="vite/client" />
import * as React from 'react'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useRouterState } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { SITE_URL, ogImage } from '~/lib/api'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'viiids: every shelf, one search' },
      { name: 'description', content: 'Search and browse NetNaija, Nkiri, Waploaded, FzMovies and O2TVSeries from one shelf.' },
      { name: 'theme-color', content: '#0f0f0f' },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:title', content: 'viiids: every shelf, one search' },
      { property: 'og:description', content: 'Search and browse movies and series across five platforms.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'viiids' },
      { property: 'og:url', content: `${SITE_URL}/` },
      { property: 'og:image', content: ogImage('brand') },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'viiids: every shelf, one search' },
      { name: 'twitter:description', content: 'Search and browse movies and series across five platforms.' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'canonical', href: `${SITE_URL}/` },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    ],
  }),
  errorComponent: (props) => <DefaultCatchBoundary {...props} />,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  React.useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
