import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createStickyTether,
  StickyTether,
  type StickyTetherState,
  useStickyTether,
  useTether
} from '../src'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

function setOffsetHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    value: height
  })
}

function mockRect(
  element: HTMLElement,
  rect: Partial<DOMRect> & { top: number; bottom?: number; height?: number }
) {
  const height = rect.height ?? (rect.bottom !== undefined ? rect.bottom - rect.top : 0)
  const bottom = rect.bottom ?? rect.top + height
  element.getBoundingClientRect = vi.fn(() => ({
    top: rect.top,
    bottom,
    height,
    left: 0,
    right: 0,
    width: 240,
    x: 0,
    y: rect.top,
    toJSON: () => ''
  }))
}

describe('sticky-tether', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500
    })
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      writable: true,
      value: 0
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('retains base stickyTop when element height fits inside viewport (bypassed) and ensures position: sticky', () => {
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    setOffsetHeight(sticky, 300)
    mockRect(parent, { top: -50 })
    parent.appendChild(sticky)
    document.body.appendChild(parent)

    const tether = createStickyTether(sticky, {
      headerHeight: 54,
      topPadding: 30,
      bottomPadding: 24
    })

    expect(sticky.style.position).toBe('sticky')
    expect(sticky.style.top).toBe('84px')
    expect(tether.getState()).toMatchObject({
      top: 84,
      baseTop: 84,
      delta: 0,
      maxDelta: 0,
      status: 'bypassed',
      hasRunway: true
    })

    window.scrollY = 200
    window.dispatchEvent(new Event('scroll'))

    expect(sticky.style.top).toBe('84px')
    tether.destroy()
    expect(sticky.style.top).toBe('')
    expect(sticky.style.position).toBe('')
  })

  test('stays idle at base stickyTop when parent content top is still below sticky threshold (including parent padding-top)', () => {
    const parent = document.createElement('div')
    parent.style.paddingTop = '16px'
    const sticky = document.createElement('aside')
    setOffsetHeight(sticky, 800)
    setOffsetHeight(parent, 2000)
    // parent border-box top is 40px, + 16px padding-top = 56px content top.
    // With stickyTop = 40 + 16 = 56px, parentContentTop - stickyTop === 0 -> idle!
    mockRect(parent, { top: 40 })
    parent.appendChild(sticky)
    document.body.appendChild(parent)

    const tether = createStickyTether(sticky, {
      headerHeight: 40,
      topPadding: 16,
      bottomPadding: 20
    })

    expect(sticky.style.top).toBe('56px')
    expect(tether.getState().status).toBe('idle')
    expect(tether.getState().delta).toBe(0)

    tether.destroy()
  })

  test('warns once and sets hasRunway=false when parent.offsetHeight <= el.offsetHeight', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    setOffsetHeight(parent, 700)
    setOffsetHeight(sticky, 700)
    mockRect(parent, { top: -20 })
    parent.appendChild(sticky)
    document.body.appendChild(parent)

    const tether = createStickyTether(sticky, {
      headerHeight: 40,
      topPadding: 16,
      bottomPadding: 20
    })

    expect(tether.getState().hasRunway).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)

    window.scrollY = 100
    window.dispatchEvent(new Event('scroll'))
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
    tether.destroy()
  })

  test('tracks bi-directional scroll, re-anchors on direction reversal, and emits onChange state', () => {
    // viewportHeight = 500 - (54 + 30) - 24 = 392
    // stickyHeight = 692 => maxDelta = 300, stickyTop = 84
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    setOffsetHeight(parent, 3000)
    setOffsetHeight(sticky, 692)
    mockRect(parent, { top: -20 })
    parent.appendChild(sticky)
    document.body.appendChild(parent)

    const states: StickyTetherState[] = []
    const tether = createStickyTether(sticky, {
      headerHeight: 54,
      topPadding: 30,
      bottomPadding: 24,
      onChange: (s) => states.push(s)
    })

    // Initial at scrollY = 0 -> delta = 0 -> top = 84px (top-locked)
    expect(sticky.style.top).toBe('84px')
    expect(tether.getState().status).toBe('top-locked')

    // Scroll down 100px -> delta = 100 -> top = 84 - 100 = -16px (tethering)
    window.scrollY = 100
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-16px')
    expect(tether.getState()).toMatchObject({
      top: -16,
      delta: 100,
      maxDelta: 300,
      direction: 'down',
      status: 'tethering'
    })

    // Scroll down far past maxDelta (scrollY = 1000) -> clamped at maxDelta = 300 -> top = 84 - 300 = -216px (bottom-locked)
    window.scrollY = 1000
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-216px')
    expect(tether.getState().status).toBe('bottom-locked')

    // Reverse direction: scroll up by 40px (scrollY = 960) -> immediately moves up by 40px -> delta = 260 -> top = 84 - 260 = -176px
    window.scrollY = 960
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-176px')
    expect(tether.getState()).toMatchObject({
      top: -176,
      delta: 260,
      direction: 'up',
      status: 'tethering'
    })
    expect(states.length).toBeGreaterThanOrEqual(4)

    tether.destroy()
    expect(sticky.style.top).toBe('')
  })

  test('clamps sticky scroll range so active item never escapes viewport', () => {
    // viewportHeight = 500 - 84 - 24 = 392, stickyHeight = 692 => maxDelta = 300
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    const activeItem = document.createElement('a')
    activeItem.setAttribute('aria-current', 'location')

    setOffsetHeight(parent, 3000)
    setOffsetHeight(sticky, 692)
    mockRect(parent, { top: -50 })
    mockRect(sticky, { top: 84, height: 692 })
    // Active item is at offset 90..120 inside sticky
    mockRect(activeItem, { top: 84 + 90, bottom: 84 + 120, height: 30 })

    sticky.appendChild(activeItem)
    parent.appendChild(sticky)
    document.body.appendChild(parent)

    const tether = createStickyTether(sticky, {
      headerHeight: 54,
      topPadding: 30,
      bottomPadding: 24
    })

    // Scroll down 250px: without active item guard delta would be 250,
    // but activeTop is 90 so delta is clamped to 90 -> top = 84 - 90 = -6px
    window.scrollY = 250
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-6px')

    // Now move active item near the bottom of sticky (offset 500..532 inside sticky)
    // minDeltaLimit = 532 - 392 = 140
    mockRect(activeItem, { top: 84 + 500, bottom: 84 + 532, height: 32 })
    window.scrollY = 600
    window.dispatchEvent(new Event('scroll'))
    // Scroll down reaches maxDelta = 300 -> top = 84 - 300 = -216px
    expect(sticky.style.top).toBe('-216px')

    // Scroll up 250px (scrollY = 350): without active item guard delta would drop to 50,
    // pushing active item (bottom 532) below viewport (392). Clamped at minDeltaLimit = 140 -> top = 84 - 140 = -56px
    window.scrollY = 350
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-56px')

    tether.destroy()
  })

  test('supports React hook useTether and StickyTether component', () => {
    expect(useTether).toBe(useStickyTether)

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const ref = React.createRef<HTMLElement>()

    function Demo() {
      const hookRef = useTether<HTMLDivElement>({ topPadding: 20 })
      return (
        <div>
          <div ref={hookRef} data-testid='hook-node' />
          <StickyTether ref={ref} data-testid='tether-aside' topPadding={20}>
            <span>TOC</span>
          </StickyTether>
        </div>
      )
    }

    act(() => {
      root.render(<Demo />)
    })

    const el = container.querySelector('[data-testid="tether-aside"]') as HTMLElement
    expect(el.tagName).toBe('ASIDE')
    expect(ref.current).toBe(el)

    act(() => {
      window.dispatchEvent(new Event('scroll'))
      root.unmount()
    })
  })

  test('supports custom HTMLElement scroll container positioned down the page', () => {
    const scrollBox = document.createElement('div')
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    setOffsetHeight(scrollBox, 600)
    setOffsetHeight(parent, 3000)
    setOffsetHeight(sticky, 1000)

    // Scroll container sits at y=800 in the window, parent has scrolled 30px past container top
    mockRect(scrollBox, { top: 800, height: 600 })
    mockRect(parent, { top: 770 })
    parent.appendChild(sticky)
    scrollBox.appendChild(parent)
    document.body.appendChild(scrollBox)

    const tether = createStickyTether(sticky, {
      container: scrollBox,
      headerHeight: 40,
      topPadding: 20,
      bottomPadding: 20
    })

    scrollBox.scrollTop = 120
    scrollBox.dispatchEvent(new Event('scroll'))
    // stickyTop = 60, delta = 120 -> top = 60 - 120 = -60px
    expect(sticky.style.top).toBe('-60px')

    tether.destroy()
  })
})
