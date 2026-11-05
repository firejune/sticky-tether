import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createStickyTether, StickyTether, useStickyTether, useTether } from '../src'

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

  test('leaves style.top empty when element height fits inside viewport', () => {
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

    window.scrollY = 200
    window.dispatchEvent(new Event('scroll'))

    expect(sticky.style.top).toBe('')
    tether.destroy()
  })

  test('does not engage when parent top is still below sticky threshold', () => {
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    setOffsetHeight(sticky, 800)
    mockRect(parent, { top: 120 })
    parent.appendChild(sticky)
    document.body.appendChild(parent)

    const tether = createStickyTether(sticky, {
      headerHeight: 54,
      topPadding: 30,
      bottomPadding: 24
    })

    window.scrollY = 100
    window.dispatchEvent(new Event('scroll'))

    expect(sticky.style.top).toBe('')
    tether.destroy()
  })

  test('tracks bi-directional scroll and re-anchors on direction reversal without jumping', () => {
    // viewportHeight = 500 - (54 + 30) - 24 = 392
    // stickyHeight = 692 => maxDelta = 300, stickyTop = 84
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    setOffsetHeight(sticky, 692)
    mockRect(parent, { top: -20 })
    parent.appendChild(sticky)
    document.body.appendChild(parent)

    const tether = createStickyTether(sticky, {
      headerHeight: 54,
      topPadding: 30,
      bottomPadding: 24
    })

    // Initial at scrollY = 0 -> delta = 0 -> top = 84px
    expect(sticky.style.top).toBe('84px')

    // Scroll down 100px -> delta = 100 -> top = 84 - 100 = -16px
    window.scrollY = 100
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-16px')

    // Scroll down far past maxDelta (scrollY = 1000) -> clamped at maxDelta = 300 -> top = 84 - 300 = -216px
    window.scrollY = 1000
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-216px')

    // Reverse direction: scroll up by 40px (scrollY = 960) -> immediately moves up by 40px -> delta = 260 -> top = 84 - 260 = -176px
    window.scrollY = 960
    window.dispatchEvent(new Event('scroll'))
    expect(sticky.style.top).toBe('-176px')

    tether.destroy()
    expect(sticky.style.top).toBe('')
  })

  test('clamps sticky scroll range so active item never escapes viewport', () => {
    // viewportHeight = 500 - 84 - 24 = 392, stickyHeight = 692 => maxDelta = 300
    const parent = document.createElement('div')
    const sticky = document.createElement('aside')
    const activeItem = document.createElement('a')
    activeItem.setAttribute('aria-current', 'location')

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
})
