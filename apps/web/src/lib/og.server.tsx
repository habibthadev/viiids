import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

export interface OgInput {
  title: string
  eyebrow: string
  index: string
  kind: 'movie' | 'series' | 'all'
}

const fontCache = new Map<string, ArrayBuffer>()

async function getFont(family: 'Poppins' | 'Plus Jakarta Sans', weight: 500 | 700): Promise<ArrayBuffer> {
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

export async function renderOg({ title, eyebrow, index, kind }: OgInput): Promise<Uint8Array> {
  const [poppins700, poppins500, jakarta700] = await Promise.all([
    getFont('Poppins', 700),
    getFont('Poppins', 500),
    getFont('Plus Jakarta Sans', 700),
  ])
  const size = title.length > 52 ? 54 : title.length > 30 ? 66 : 80
  const svg = await satori(
    <div
      style={{
        width: 1200,
        height: 630,
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        fontFamily: 'Poppins',
        border: '24px solid #0f0f0f',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 16, height: 16, borderRadius: 999, backgroundColor: '#0c76fe' }} />
        <div
          style={{
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 4,
            color: '#0f0f0f',
          }}
        >
          {eyebrow.toUpperCase()}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40 }}>
        <div
          style={{
            fontSize: size,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            color: '#0f0f0f',
            maxHeight: size * 2.2,
            overflow: 'hidden',
            flex: 1,
          }}
        >
          {title}
        </div>
        {index ? (
          <div style={{ fontSize: 200, fontWeight: 700, lineHeight: 0.9, color: '#efefef' }}>{index}</div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '2px solid #dbdbdb',
          paddingTop: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: '#0f0f0f',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 26, fontWeight: 700, letterSpacing: 3, color: '#0f0f0f' }}>
            VIIIDS
          </div>
        </div>
        <div
          style={{
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            color: '#0f0f0f',
            border: '2px solid #0f0f0f',
            borderRadius: 999,
            padding: '10px 28px',
            backgroundColor: kind === 'movie' ? '#dcf58f' : '#ffffff',
          }}
        >
          {kind.toUpperCase()}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Poppins', data: poppins700, weight: 700 },
        { name: 'Poppins', data: poppins500, weight: 500 },
        { name: 'Plus Jakarta Sans', data: jakarta700, weight: 700 },
      ],
    },
  )
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
}
