import * as React from 'react'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { Flip } from 'gsap/Flip'

let ready = false

/** Register plugins once, client-side only. */
export function ensureGsap(): boolean {
  if (typeof window === 'undefined') return false
  if (!ready) {
    gsap.registerPlugin(CustomEase, Flip)
    try {
      CustomEase.create('v-out', '0.23,1,0.32,1')
      CustomEase.create('v-page', '0.76,0,0.24,1')
    } catch {
      /* cubic-bezier strings are supported in gsap 3.13+ */
    }
    ready = true
  }
  return true
}

export const EASE = {
  out: 'v-out',
  page: 'v-page',
} as const

export const useIsoLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

export function prefersReduced(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isFinePointer(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: fine)').matches
}

/** Stagger in all [data-rise] descendants. Content is visible without JS. */
export function useRise(
  ref: React.RefObject<HTMLElement | null>,
  deps: React.DependencyList = [],
  opts: { delay?: number; y?: number; stagger?: number; selector?: string } = {},
) {
  useIsoLayoutEffect(() => {
    if (!ref.current || !ensureGsap() || prefersReduced()) return
    const els = ref.current.querySelectorAll(opts.selector ?? '[data-rise]')
    if (els.length === 0) return
    const tween = gsap.fromTo(
      els,
      { y: opts.y ?? 8, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.45,
        delay: opts.delay ?? 0,
        stagger: opts.stagger ?? 0.04,
        ease: EASE.out,
        clearProps: 'transform,opacity',
      },
    )
    return () => {
      tween.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * The artifact's signature: one floating plate that glides under the
 * hovered/focused row, while siblings dim. Delegated, so any row markup works.
 */
export function useHoverPlate(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const root = ref.current
    if (!root || !ensureGsap() || prefersReduced() || !isFinePointer()) return
    const plate = root.querySelector<HTMLElement>('[data-plate]')
    if (!plate) return
    let showing = false

    const rowFrom = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null
      const row = target.closest<HTMLElement>('[data-row]')
      return row && root.contains(row) ? row : null
    }

    const show = (row: HTMLElement) => {
      root.dataset.hovering = ''
      root.querySelectorAll<HTMLElement>('[data-row][data-hover]').forEach((el) => {
        if (el !== row) delete el.dataset.hover
      })
      row.dataset.hover = ''
      const top = row.offsetTop
      const height = row.offsetHeight
      gsap.to(plate, {
        y: top,
        height,
        autoAlpha: showing ? 1 : 0,
        duration: showing ? 0.24 : 0.16,
        ease: EASE.out,
        overwrite: 'auto',
      })
      if (!showing) {
        showing = true
        gsap.to(plate, { autoAlpha: 1, duration: 0.16, ease: EASE.out, overwrite: false })
      }
    }

    const hide = () => {
      if (!showing) return
      showing = false
      delete root.dataset.hovering
      root.querySelectorAll<HTMLElement>('[data-row][data-hover]').forEach((el) => delete el.dataset.hover)
      gsap.to(plate, { autoAlpha: 0, duration: 0.15, ease: EASE.out, overwrite: 'auto' })
    }

    const onOver = (e: PointerEvent) => {
      const row = rowFrom(e.target)
      if (row) show(row)
      else hide()
    }
    const onLeave = () => hide()
    const onFocusIn = (e: FocusEvent) => {
      const row = rowFrom(e.target)
      if (row) show(row)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (!rowFrom(e.relatedTarget)) hide()
    }

    root.addEventListener('pointerover', onOver)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)

    return () => {
      root.removeEventListener('pointerover', onOver)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      gsap.killTweensOf(plate)
    }
  }, [ref])
}

/** Animate a portal popover in. */
export function popIn(elm: HTMLElement | null) {
  if (!elm || !ensureGsap() || prefersReduced()) return
  gsap.fromTo(
    elm,
    { autoAlpha: 0, y: -4, scale: 0.98, transformOrigin: 'top center' },
    { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: EASE.out, clearProps: 'transform' },
  )
}

/** Animate an overlay + window in. */
export function overlayIn(overlay: HTMLElement | null, win: HTMLElement | null, from: 'center' | 'bottom' | 'top' = 'center') {
  if (!overlay || !ensureGsap() || prefersReduced()) return
  gsap.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: EASE.out })
  if (!win) return
  const y = from === 'bottom' ? 24 : from === 'top' ? -12 : 10
  gsap.fromTo(win, { autoAlpha: 0, y, scale: 0.99 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: EASE.page, clearProps: 'transform' })
}

/** Expand/collapse a disclosure with the artifact's easing. */
export function animateDisclosure(elm: HTMLElement | null, open: boolean) {
  if (!elm || !ensureGsap() || prefersReduced()) return
  if (open) {
    gsap.fromTo(
      elm,
      { height: 0, autoAlpha: 0 },
      {
        height: 'auto',
        autoAlpha: 1,
        duration: 0.3,
        ease: EASE.out,
        onComplete: () => {
          elm.style.height = 'auto'
        },
      },
    )
  } else {
    gsap.to(elm, { height: 0, autoAlpha: 0, duration: 0.22, ease: EASE.out })
  }
}

export type FlipState = ReturnType<typeof Flip.getState>

/** Capture for a view flip (list <-> grid). No-op under reduced motion. */
export function captureFlip(selector: string, props = 'opacity,scale'): FlipState | null {
  if (!ensureGsap() || prefersReduced()) return null
  return Flip.getState(selector, { props })
}

/** Play a captured flip. Returns the tween for cleanup. */
export function playFlip(state: FlipState | null, selector: string) {
  if (!state || !ensureGsap() || prefersReduced()) return null
  return Flip.from(state, {
    duration: 0.5,
    ease: 'v-page',
    stagger: 0.015,
    absolute: true,
    prune: true,
    onEnter: (els) =>
      gsap.fromTo(els, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'v-out' }),
    onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.98, duration: 0.18, ease: 'v-out' }),
    ...(selector ? {} : {}),
  })
}

/** Theme flip through the View Transitions API when available. */
export function flipTheme(apply: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
  if (typeof doc.startViewTransition === 'function' && !prefersReduced()) {
    doc.startViewTransition(apply)
  } else {
    apply()
  }
}
