import * as React from 'react'
import { flipTheme } from '~/lib/motion'

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'viiids-theme'

/** Inline boot script: applies the stored/system theme before first paint. */
export const THEME_BOOT = `(function(){try{var k='${THEME_KEY}';var s=localStorage.getItem(k);var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;e.classList.toggle('dark',d);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#000000':'#ffffff')}catch(e){}})()`

function read(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const listeners = new Set<(t: Theme) => void>()

function apply(t: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', t === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#000000' : '#ffffff')
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l(t))
}

export function setTheme(t: Theme) {
  flipTheme(() => apply(t))
}

export function useTheme(): { theme: Theme; toggle: () => void; set: (t: Theme) => void } {
  const [theme, setState] = React.useState<Theme>(() => read())

  React.useEffect(() => {
    setState(read())
    const fn = (t: Theme) => setState(t)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  return {
    theme,
    toggle: () => setTheme(read() === 'dark' ? 'light' : 'dark'),
    set: setTheme,
  }
}
