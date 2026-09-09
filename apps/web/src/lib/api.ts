import { z } from 'zod'

export const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:8080'

export const SITE_URL = (import.meta as any).env?.VITE_SITE_URL ?? 'http://localhost:3000'

/** Absolute URL for a pre-rendered OG image. Static files beat runtime
rendering: they work on every host with zero native dependencies. */
export function ogImage(name: 'brand' | PlatformId): string {
  return `${SITE_URL}/og/${name}.png`
}

export const PlatformId = z.enum(['netnaija', 'nkiri', 'waploaded', 'fzmovies', 'o2tvseries'])
export type PlatformId = z.infer<typeof PlatformId>

export const PlatformMeta = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  description: z.string(),
})
export type PlatformMeta = z.infer<typeof PlatformMeta>

export const Movie = z.object({
  Index: z.number().optional(),
  Title: z.string(),
  CoverPhotoLink: z.string().optional().default(''),
  Description: z.string().optional().default(''),
  Size: z.string().optional().default(''),
  DownloadLink: z.string(),
  SDownloadLink: z.record(z.string()).default({}),
  Year: z.number().optional().default(0),
  IsSeries: z.boolean().optional().default(false),
  Quality: z.string().optional().default(''),
  Category: z.string().optional().default(''),
  Cast: z.string().optional().default(''),
  UploadDate: z.string().optional().default(''),
  Source: z.string().optional().default(''),
  ImdbLink: z.string().optional().default(''),
  Tags: z.string().optional().default(''),
})
export type Movie = z.infer<typeof Movie>

const Envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ ok: z.boolean(), data: data.optional(), error: z.string().optional(), count: z.number().optional() })

export const Kind = z.enum(['all', 'movie', 'series'])
export type Kind = z.infer<typeof Kind>

export const ResolveResult = z.object({
  title: z.string().optional().default(''),
  direct: z.array(z.string()).default([]),
  pages: z.array(z.string()).default([]),
  note: z.string().optional().default(''),
})
export type ResolveResult = z.infer<typeof ResolveResult>

export const SearchParams = z.object({
  platform: PlatformId,
  q: z.string().trim().min(1).max(120),
  kind: Kind.default('all'),
})
export const ListParams = z.object({
  platform: PlatformId,
  page: z.number().int().min(1).max(20).default(1),
  kind: Kind.default('all'),
})

async function getJSON<T>(url: string, schema: z.ZodTypeAny): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const errBody = (await res.json()) as { error?: string }
      if (errBody?.error) msg = errBody.error
    } catch {
      /* keep status text */
    }
    throw new Error(msg)
  }
  const json = await res.json()
  return schema.parse(json) as T
}

export function fetchPlatforms(): Promise<PlatformMeta[]> {
  return getJSON<{ ok: boolean; data?: PlatformMeta[] }>(
    `${API_BASE}/api/platforms`,
    Envelope(z.array(PlatformMeta)),
  ).then((e) => e.data ?? [])
}

export function fetchSearch(p: z.input<typeof SearchParams>): Promise<Movie[]> {
  const v = SearchParams.parse(p)
  return getJSON<{ ok: boolean; data?: Movie[] }>(
    `${API_BASE}/api/search?platform=${v.platform}&q=${encodeURIComponent(v.q)}&kind=${v.kind}`,
    Envelope(z.array(Movie)),
  ).then((e) => e.data ?? [])
}

export function fetchList(p: z.input<typeof ListParams>): Promise<Movie[]> {
  const v = ListParams.parse(p)
  return getJSON<{ ok: boolean; data?: Movie[] }>(
    `${API_BASE}/api/list?platform=${v.platform}&page=${v.page}&kind=${v.kind}`,
    Envelope(z.array(Movie)),
  ).then((e) => e.data ?? [])
}

export const ALL_PLATFORMS: PlatformId[] = ['netnaija', 'nkiri', 'waploaded', 'fzmovies', 'o2tvseries']

// Shelves shown in the UI. The rest stay live in the API but hidden.
export const VISIBLE_PLATFORMS: PlatformId[] = ['nkiri']

export function isPlatform(v: unknown): v is PlatformId {
  return typeof v === 'string' && (ALL_PLATFORMS as string[]).includes(v)
}

export function fetchResolve(pageUrl: string): Promise<ResolveResult> {
  return getJSON<{ ok: boolean; data?: ResolveResult }>(
    `${API_BASE}/api/resolve?url=${encodeURIComponent(pageUrl)}`,
    Envelope(ResolveResult),
  ).then((e) => e.data ?? { title: '', direct: [], pages: [], note: '' })
}

/** In-site download URL: streams the file through the API with attachment disposition. */
export function downloadHref(fileUrl: string, filename?: string, referer?: string, page?: string): string {
  const q =
    `url=${encodeURIComponent(fileUrl)}` +
    (filename ? `&filename=${encodeURIComponent(filename)}` : '') +
    (referer ? `&referer=${encodeURIComponent(referer)}` : '') +
    (page ? `&page=${encodeURIComponent(page)}` : '')
  return `${API_BASE}/api/download?${q}`
}

export function fileLabel(url: string): string {
  try {
    const u = new URL(url)
    const base = u.pathname.split('/').filter(Boolean).pop() ?? u.host
    return decodeURIComponent(base).slice(0, 60) || u.host
  } catch {
    return url.slice(0, 60)
  }
}

/** Sorted episode entries from a series movie. Natural sort on trailing digits. */
export function episodeEntries(movie: Pick<Movie, 'SDownloadLink'>): { key: string; url: string }[] {
  const map = movie.SDownloadLink ?? {}
  const num = (k: string) => {
    const m = k.match(/(\d+)\s*$/)
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
  }
  return Object.entries(map)
    .map(([key, url]) => ({ key, url }))
    .sort((a, b) => num(a.key) - num(b.key) || a.key.localeCompare(b.key))
}
