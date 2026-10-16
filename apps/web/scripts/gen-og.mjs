// Renders the static OG set with plain Node (native resvg works here).
// Usage: pnpm --filter web gen:og   (run from repo root)
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..')
const outDir = path.join(webRoot, 'public', 'og')
mkdirSync(outDir, { recursive: true })

const bundle = path.join(webRoot, 'node_modules', '.og-bundle.cjs')
buildSync({
  entryPoints: [path.join(webRoot, 'src', 'lib', 'og.server.tsx')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundle,
  packages: 'external',
  logLevel: 'error',
})

const require = createRequire(import.meta.url)
const { renderCard } = require(bundle)

const cards = [
  { file: 'brand.png', title: 'Every shelf. One search.', eyebrow: 'movies & series', index: '' },
  { file: 'netnaija.png', title: 'Nollywood and Hollywood, fresh daily.', eyebrow: 'NetNaija', index: '01' },
  { file: 'nkiri.png', title: 'Hollywood plus Korean and Asian picks.', eyebrow: 'Nkiri', index: '02' },
  { file: 'waploaded.png', title: 'Forum shelf. Music, movies and more.', eyebrow: 'Waploaded', index: '03' },
  { file: 'fzmovies.png', title: 'Bollywood, Hollywood and dubbed, all qualities.', eyebrow: 'FzMovies', index: '04' },
  { file: 'o2tvseries.png', title: 'Movies and series packs, direct links.', eyebrow: 'O2TVSeries', index: '05' },
]

for (const c of cards) {
  const png = await renderCard({ title: c.title, eyebrow: c.eyebrow, index: c.index })
  writeFileSync(path.join(outDir, c.file), png)
  console.log('wrote og/' + c.file, png.length, 'bytes')
}
