import { FilmSlate, Television } from '@phosphor-icons/react'

export function PlatformIcon({ id, size = 20 }: { id: string; size?: number }) {
  const common = { size, weight: 'regular' as const }
  if (id === 'nkiri' || id === 'o2tvseries') return <Television {...common} />
  return <FilmSlate {...common} />
}

export interface TitleContext {
  mode: 'list' | 'search'
  q?: string
  page?: number
  kind?: 'all' | 'movie' | 'series'
  i: number
}

export interface TitleSearchParams {
  mode: 'list' | 'search'
  q?: string
  page: number
  kind: 'all' | 'movie' | 'series'
  i: number
}

export function titleSearch(c: TitleContext): TitleSearchParams {
  const s: TitleSearchParams = { mode: c.mode, page: c.page ?? 1, kind: c.kind ?? 'all', i: c.i }
  if (c.q) s.q = c.q
  return s
}
