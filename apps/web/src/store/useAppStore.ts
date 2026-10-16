import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlatformId } from '~/lib/api'

export type SortMode = 'relevance' | 'year-desc' | 'title-az'
export type ViewMode = 'list' | 'grid'

interface AppState {
  sort: SortMode
  view: ViewMode
  paletteOpen: boolean
  set: (p: Partial<AppState>) => void
  toggleView: () => void
  setPalette: (open: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sort: 'relevance',
      view: 'list',
      paletteOpen: false,
      set: (p) => set(p),
      toggleView: () => set((s) => ({ view: s.view === 'list' ? 'grid' : 'list' })),
      setPalette: (open) => set({ paletteOpen: open }),
    }),
    {
      name: 'viiids-ui',
      partialize: (s) => ({ sort: s.sort, view: s.view }) as AppState,
    },
  ),
)

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
  fzmovies: 'Bollywood, Hollywood and dubbed, all qualities.',
  o2tvseries: 'Movies and series packs, direct links.',
}
