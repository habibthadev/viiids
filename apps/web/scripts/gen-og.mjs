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
  { file: 'brand.png', title: 'Every shelf. One search.', eyebrow: 'VIIIDS', index: '', kind: 'all' },
  { file: 'netnaija.png', title: 'Nollywood first. fresh daily.', eyebrow: 'NetNaija', index: '01', kind: 'all' },
  { file: 'nkiri.png', title: 'Hollywood and beyond. updated hourly.', eyebrow: 'Nkiri', index: '02', kind: 'all' },
  { file: 'waploaded.png', title: 'The forum shelf. deep cuts.', eyebrow: 'Waploaded', index: '03', kind: 'all' },
  { file: 'fzmovies.png', title: 'Slow cinema. worth the wait.', eyebrow: 'FzMovies', index: '04', kind: 'all' },
  { file: 'o2tvseries.png', title: 'Series in packs. grab them whole.', eyebrow: 'O2TVSeries', index: '05', kind: 'all' },
]

for (const c of cards) {
  const png = await renderCard({ title: c.title, eyebrow: c.eyebrow, index: c.index, kind: c.kind })
  writeFileSync(path.join(outDir, c.file), png)
  console.log('wrote og/' + c.file, png.length, 'bytes')
}
