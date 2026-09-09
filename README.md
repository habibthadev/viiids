# viiids

Every shelf. One search. Search and browse movies and series across five
platforms (NetNaija, Nkiri, Waploaded, FzMovies, O2TVSeries) from one fast,
accessible shelf. In-site downloads stream through the API, no new tabs.

Monorepo: TanStack Start web app (`apps/web`, Vercel) + Go JSON API
(`apps/api`, Vercel Go server), managed with pnpm workspaces.

## Quickstart

Prerequisites: Node 20+, pnpm 9+, Go 1.22+.

```bash
pnpm install
pnpm dev
```

That starts both servers with one command:

| Service | URL                   | Source     |
| ------- | --------------------- | ---------- |
| Web     | http://localhost:3000 | `apps/web` |
| API     | http://localhost:8080 | `apps/api` |

## Scripts (repo root)

| Command            | What it does                              |
| ------------------ | ----------------------------------------- |
| `pnpm dev`         | API + web together (concurrently)         |
| `pnpm dev:api`     | Go API only (`PORT=8080`)                 |
| `pnpm dev:web`     | Web only                                  |
| `pnpm build:web`   | Production build (Nitro output)           |
| `pnpm build:api`   | API binary to `bin/api`                   |
| `pnpm typecheck`   | `tsc --noEmit` for the web app            |

## API reference

Base URL autodetects `VITE_API_BASE`, default `http://localhost:8080`.
All scraping responses share one envelope:

```json
{ "ok": true, "data": [...], "platform": "nkiri", "count": 5 }
```

| Method | Endpoint               | Params                                                        | Notes                                    |
| ------ | ---------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| GET    | `/api/health`          | —                                                             | Liveness probe                           |
| GET    | `/api/platforms`       | —                                                             | The 5 supported platforms                |
| GET    | `/api/search`          | `platform`, `q` (1–120 chars), `kind=all\|movie\|series`       | Scrapes the platform live                |
| GET    | `/api/list`            | `platform`, `page` (1–20), `kind=all\|movie\|series`           | Trending shelf                           |
| GET    | `/api/resolve`         | `url`                                                         | Finds direct file links on a source page |
| GET    | `/api/download`        | `url`, optional `filename`, `referer`, `page`                 | Streams the file (Range supported)       |

Platform ids: `netnaija`, `nkiri` (`thenkiri` and `02tvseries` accepted as
aliases for `nkiri` and `o2tvseries`). The web UI currently shows Nkiri only;
see `VISIBLE_PLATFORMS` in `apps/web/src/lib/api.ts` to reveal the rest.

Errors use `{ "ok": false, "error": "..." }` with honest statuses: 400 bad
input, 502 blocked/slow source, 504 scrape timeout, 415 not a media file.

```bash
curl "http://localhost:8080/api/search?platform=nkiri&q=jumanji&kind=movie"
curl "http://localhost:8080/api/resolve?url=<source-page-url>"
curl -O -J "http://localhost:8080/api/download?url=<file-url>&page=<source-page-url>"
```

## Environment

| Variable            | Where          | Default                 | Purpose                              |
| ------------------- | -------------- | ----------------------- | ------------------------------------ |
| `PORT`              | API            | `8080`                  | Listen port                          |
| `VITE_API_BASE`     | Web build time | `http://localhost:8080` | API origin (prod: Vercel API URL)    |
| `VITE_SITE_URL`     | Web build time | `http://localhost:3000` | Canonical origin for OG/meta         |
| `DL_ALLOW_PRIVATE`  | API (`=1`)     | unset (blocked)         | Allow private IPs in resolve/download (local tests only) |

Local files: `apps/web/.env` (dev, never committed). Production values live
only in the Vercel dashboard, never in the repo.

## Project structure

```text
viiids/
  apps/
    api/                  Go JSON API (module viiids-api, Vercel Go server)
      engine/             5 scrapers: netnaija, nkiri, waploaded, fzmovies, o2tvseries
      internal/api/       shared handlers: cache, singleflight, resolve, download
      main.go             net/http server on PORT (local dev and Vercel alike)
      vercel.json         Go framework preset
    web/                  TanStack Start + React 19 + TypeScript
      src/routes/         / landing, /$platformId (browse, movies, series, title), /api/og
      src/components/     custom kit: search, segmented, chips, rows, modal, drawer
      src/lib/            zod API client, OG renderer (satori + resvg)
      src/store/          zustand UI prefs
      public/             favicon set, manifest, robots, sitemap
  reference-code/         untouched legacy Gophie source (not built)
  vercel.json             intentionally empty: file config beats dashboard
                        config, so per-project settings live in dashboards
```

`apps/web/src/routeTree.gen.ts` is generated on dev/build; never edit it.

## Deploy

Everything deploys from the Vercel dashboard, no CLI. Create two projects
from the same repo. One rule runs the whole setup: the repo-root `vercel.json`
is intentionally empty, because file config beats dashboard config every time
and a shared file cannot serve two different apps. So each project is
configured 100% in its own dashboard rows:

### Web → Vercel (`viiids`)

Root Directory `./`, plus:

| Setting          | Value                        |
| ---------------- | ---------------------------- |
| Install Command  | `pnpm install`               |
| Build Command    | `pnpm --filter web build`    |
| Output Directory | `apps/web/.vercel/output`    |
| Framework        | Other (Nitro preset handles it) |
| Node.js Version  | 22.x                         |

Environment → add before the first build:
- `VITE_API_BASE=https://viiids-api.vercel.app`
- `VITE_SITE_URL=https://viiids.vercel.app`

Deploy. Dynamic OG images render at `/api/og` (satori + resvg run in the
serverless function; fonts load from Google at runtime and cache in memory).

### API → Vercel (`viiids-api`)

Root Directory `apps/api`, every other build row left empty. The Go runtime
auto-detects `go.mod` + `main.go` and runs the server on `PORT`. No
environment variables needed. Deploy. The API answers at
`https://viiids-api.vercel.app`, health check included: `GET /api/health`.

Notes: instances cache in memory only, so the first scrape after idle pays a
cold start. Long downloads stream without buffering, and no function timeout
cuts them off mid-file the way serverless caps would.

## How downloads work

1. Search/list returns source page URLs plus per-episode links for series.
2. `/api/resolve` opens the page server-side: direct media links, inline JS
   token links (meetdownload), and gated form unlocks (downloadwella XFS),
   then verifies each candidate with header probes. Junk and subtitles never
   reach the UI.
3. `/api/download` streams the verified file with `attachment` disposition and
   full Range support. File-host tokens expire in about a minute, so every
   link carries its source page and the endpoint re-unlocks automatically.
4. Hosts that gate with countdowns or CAPTCHAs cannot be proxied; the UI says
   so and falls back to opening the source.

## License

See `reference-code/LICENSE` (GNU AGPLv3, inherited from the original project).
