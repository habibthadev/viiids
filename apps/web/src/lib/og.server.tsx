import satoriImport from 'satori'
import { Resvg } from '@resvg/resvg-js'

type SatoriFn = (element: unknown, options: Record<string, unknown>) => Promise<string>

// Bundlers wrap the export zero, one, or two levels deep depending on
// CJS/ESM interop. Unwrap until a function appears.
function loadSatori(): SatoriFn {
  let cur: unknown = satoriImport as unknown
  for (let i = 0; i < 3; i++) {
    if (typeof cur === 'function') return cur as SatoriFn
    if (cur && typeof cur === 'object' && 'default' in cur) {
      cur = (cur as { default: unknown }).default
      continue
    }
    break
  }
  throw new Error('cannot load satori renderer')
}

export interface OgInput {
  title: string
  eyebrow: string
  index?: string
  url?: string
}

const fontCache = new Map<string, ArrayBuffer>()

export async function getOgFont(
  family: 'Plus Jakarta Sans' | 'Manrope',
  weight: 500 | 700 | 800,
): Promise<ArrayBuffer> {
  const key = `${family}:${weight}`
  const hit = fontCache.get(key)
  if (hit) return hit
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&display=swap`)
  ).text()
  // Collect @font-face blocks for this family+weight; prefer the latin subset.
  const faces = css.match(/\/\*[a-z-]+\s*\*\/\s*@font-face\s*{[^}]+}|@font-face\s*{[^}]+}/g) ?? []
  let fallback = ''
  let latin = ''
  for (const b of faces) {
    if (!b.includes(`font-weight: ${weight}`)) continue
    const m = b.match(/url\((https:[^)]+\.ttf)\)/)
    if (!m) continue
    if (/\/\*\s*latin\s*\*\//.test(b)) latin = m[1]
    else if (!fallback) fallback = m[1]
  }
  const fontUrl = latin || fallback
  if (!fontUrl) throw new Error(`no font: ${key}`)
  const buf = await (await fetch(fontUrl)).arrayBuffer()
  fontCache.set(key, buf)
  return buf
}

export async function renderCard(input: OgInput): Promise<Uint8Array> {
  const svg = await renderSvg(input)
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}

async function renderSvg(input: OgInput): Promise<string> {
  const satori = loadSatori()
  const [jakarta800, manrope500, manrope700] = await Promise.all([
    getOgFont('Plus Jakarta Sans', 800),
    getOgFont('Manrope', 500),
    getOgFont('Manrope', 700),
  ])
  return satori(OgCard(input), {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Plus Jakarta Sans', data: jakarta800, weight: 800 },
      { name: 'Manrope', data: manrope500, weight: 500 },
      { name: 'Manrope', data: manrope700, weight: 700 },
    ],
  })
}

/**
 * Dark editorial card: charcoal canvas, brand lime accents, ghost masthead
 * numeral (same motif as the landing page) and a live-looking footer strip.
 */
export function OgCard({ title, eyebrow, index, url = 'viiids.vercel.app' }: OgInput) {
  const size = title.length > 64 ? 58 : title.length > 38 ? 68 : 82
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        backgroundColor: '#0f0f0f',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 76px',
        fontFamily: 'Manrope',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {index ? (
        <div
          style={{
            position: 'absolute',
            top: -48,
            right: 40,
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 300,
            fontWeight: 800,
            lineHeight: 1,
            color: '#191919',
            whiteSpace: 'nowrap',
          }}
        >
          {index}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: '#dcf58f' }} />
        <div
          style={{
            fontFamily: 'Manrope',
            fontSize: 23,
            fontWeight: 700,
            letterSpacing: 6,
            color: '#dcf58f',
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
        <div
          style={{
            width: 92,
            height: 10,
            borderRadius: 5,
            backgroundImage: 'linear-gradient(90deg, #dcf58f, #9fe870)',
          }}
        />
        <div
          style={{
            fontFamily: 'Plus Jakarta Sans',
            fontSize: size,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: '-0.02em',
            color: '#f5f5f1',
            maxHeight: Math.round(size * 3.2),
            overflow: 'hidden',
            maxWidth: 950,
          }}
        >
          {title}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #262626',
          paddingTop: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              backgroundColor: '#dcf58f',
              color: '#0f0f0f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            V
          </div>
          <div
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 4,
              color: '#f5f5f1',
            }}
          >
            viiids
          </div>
        </div>
        <div style={{ fontFamily: 'Manrope', fontSize: 22, fontWeight: 500, letterSpacing: 1, color: '#75756e' }}>{url}</div>
      </div>
    </div>
  )
}
