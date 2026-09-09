import { create } from 'zustand'
import type { PlatformId } from '~/lib/api'

export type SortMode = 'relevance' | 'year-desc' | 'title-az'

interface AppState {
  platform: PlatformId
  sort: SortMode
  onlySeries: boolean
  onlyMovies: boolean
  withCover: boolean
  set: (p: Partial<AppState>) => void
}

export const useAppStore = create<AppState>((set) => ({
  platform: 'netnaija',
  sort: 'relevance',
  onlySeries: false,
  onlyMovies: false,
  withCover: false,
  set: (p) => set(p),
}))

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  netnaija: 'NetNaija',
  nkiri: 'Nkiri',
  waploaded: 'Waploaded',
  fzmovies: 'FzMovies',
  o2tvseries: 'O2TVSeries',
}

export const PLATFORM_BLURBS: Record<PlatformId, string> = {
  netnaija: 'Nollywood and Hollywood films, fresh daily.',
  nkiri: 'Hollywood plus Korean and Asian picks.',
  waploaded: 'Forum shelf. Music, movies and more.',
  fzmovies: 'Reviews and features, curated slow.',
  o2tvseries: 'Movies and series packs, direct links.',
}

export const PLATFORM_TAGLINES: Record<PlatformId, [string, string]> = {
  netnaija: ['Nollywood first.', 'fresh daily.'],
  nkiri: ['Hollywood and beyond.', 'updated hourly.'],
  waploaded: ['The forum shelf.', 'deep cuts.'],
  fzmovies: ['Slow cinema.', 'worth the wait.'],
  o2tvseries: ['Series in packs.', 'grab them whole.'],
}
