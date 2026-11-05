export interface StickyTetherOptions {
  /**
   * Extra spacing (in px) below the fixed header when stuck at the top.
   * @default 0
   */
  topPadding?: number
  /**
   * Extra spacing (in px) above the bottom of the viewport when stuck at the bottom.
   * @default 24
   */
  bottomPadding?: number
  /**
   * Initial offset (in px) before sticky tethering engages.
   * @default 0
   */
  offsetTop?: number
  /**
   * Fixed header height in px, or a CSS custom property name (e.g. `'--header-height'`).
   * When omitted, automatically reads `--header-height` or `--notion-header-height`
   * from computed styles and falls back to `defaultHeaderHeight`.
   */
  headerHeight?: number | string
  /**
   * Fallback header height (in px) when no CSS custom property is found.
   * @default 0
   */
  defaultHeaderHeight?: number
  /**
   * Scroll container. Defaults to `window`. Can be an `HTMLElement` or a CSS selector
   * string (e.g. `'#app-scroll-container'`).
   */
  container?: HTMLElement | Window | string | null
  /**
   * CSS selector for the currently active/focused item inside the sticky element
   * (e.g. an active TOC link or selected sidebar menu item). When matched, the tether
   * clamps its scroll range so the active item never escapes past the top or bottom
   * edge of the visible viewport. Pass `false` to disable active-item clamping.
   * @default '[aria-current="location"], [aria-current="page"], [data-active="true"], .active'
   */
  activeSelector?: string | false
}

export interface StickyTetherInstance {
  /** Force a measurement and position update. */
  update: () => void
  /** Disconnect all listeners and reset inline `style.top`. */
  destroy: () => void
}

const DEFAULT_ACTIVE_SELECTOR =
  '[aria-current="location"], [aria-current="page"], [data-active="true"], .active'

function resolveContainer(
  container: StickyTetherOptions['container']
): HTMLElement | Window | null {
  if (typeof window === 'undefined') return null
  if (container === undefined) return window
  if (container === null) return null
  if (typeof container === 'string') {
    return document.querySelector<HTMLElement>(container)
  }
  return container
}

function resolveHeaderHeight(
  el: HTMLElement,
  headerHeight: StickyTetherOptions['headerHeight'],
  defaultHeaderHeight: number
): number {
  if (typeof headerHeight === 'number') {
    return headerHeight
  }

  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return defaultHeaderHeight
  }

  const varNames =
    typeof headerHeight === 'string'
      ? [headerHeight]
      : ['--header-height', '--notion-header-height']

  for (const name of varNames) {
    const fromEl = Number.parseInt(getComputedStyle(el).getPropertyValue(name), 10)
    if (!Number.isNaN(fromEl) && fromEl > 0) return fromEl

    const fromRoot = Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue(name),
      10
    )
    if (!Number.isNaN(fromRoot) && fromRoot > 0) return fromRoot
  }

  return defaultHeaderHeight
}

/**
 * Attaches bi-directional sticky scroll tethering (and optional active-item viewport
 * clamping) to a `position: sticky` element whose height may exceed the viewport.
 */
export function createStickyTether(
  el: HTMLElement,
  options: StickyTetherOptions = {}
): StickyTetherInstance {
  const {
    topPadding = 0,
    bottomPadding = 24,
    offsetTop = 0,
    headerHeight: headerHeightOption,
    defaultHeaderHeight = 0,
    container: containerOption,
    activeSelector = DEFAULT_ACTIVE_SELECTOR
  } = options

  const scrollTarget = resolveContainer(containerOption)
  if (!scrollTarget || typeof window === 'undefined') {
    return {
      update: () => {},
      destroy: () => {}
    }
  }

  const isWindow = scrollTarget === window
  const getScrollTop = () =>
    isWindow ? window.scrollY : (scrollTarget as HTMLElement).scrollTop
  const getContainerHeight = () =>
    isWindow ? window.innerHeight : (scrollTarget as HTMLElement).offsetHeight

  const state = {
    stickyScrollTop: 0,
    isSticky: false,
    lastScrollTop: getScrollTop(),
    lastDirection: 'down' as 'up' | 'down',
    currentDelta: offsetTop
  }

  const update = () => {
    const parent = el.parentElement
    if (!parent) return

    const resolvedHeaderHeight = resolveHeaderHeight(
      el,
      headerHeightOption,
      defaultHeaderHeight
    )
    const stickyTop = resolvedHeaderHeight + topPadding
    const scrollTop = getScrollTop()
    const containerHeight = getContainerHeight()
    const viewportHeight = containerHeight - stickyTop - bottomPadding

    // Element fits inside the viewport (or is hidden): let native CSS sticky handle it
    if (el.offsetHeight <= 0 || el.offsetHeight <= viewportHeight) {
      el.style.top = ''
      state.isSticky = false
      state.currentDelta = offsetTop
      state.lastScrollTop = scrollTop
      return
    }

    // Parent has not reached the sticky threshold yet (measured relative to scroll container)
    const containerTop = isWindow
      ? 0
      : (scrollTarget as HTMLElement).getBoundingClientRect().top
    const parentTop = parent.getBoundingClientRect().top - containerTop
    if (parentTop - stickyTop >= 0) {
      el.style.top = ''
      state.isSticky = false
      state.currentDelta = offsetTop
      state.lastScrollTop = scrollTop
      return
    }

    const direction: 'up' | 'down' =
      scrollTop > state.lastScrollTop
        ? 'down'
        : scrollTop < state.lastScrollTop
          ? 'up'
          : state.lastDirection

    // Re-anchor on initial sticky activation or scroll direction reversal
    if (!state.isSticky || direction !== state.lastDirection) {
      const anchorScrollTop = state.isSticky ? state.lastScrollTop : scrollTop
      state.stickyScrollTop = anchorScrollTop - state.currentDelta + offsetTop
      state.isSticky = true
      state.lastDirection = direction
    }

    const delta = scrollTop - state.stickyScrollTop + offsetTop
    const maxDelta = el.offsetHeight - viewportHeight + offsetTop

    let minDeltaLimit = offsetTop
    let maxDeltaLimit = maxDelta

    if (activeSelector) {
      const activeEl = el.querySelector<HTMLElement>(activeSelector)
      if (activeEl) {
        const elRect = el.getBoundingClientRect()
        const activeRect = activeEl.getBoundingClientRect()
        const activeTop = activeRect.top - elRect.top
        const activeBottom = activeRect.bottom - elRect.top

        minDeltaLimit = Math.max(
          offsetTop,
          Math.min(maxDelta, activeBottom - viewportHeight + offsetTop)
        )
        maxDeltaLimit = Math.min(maxDelta, Math.max(offsetTop, activeTop + offsetTop))
        if (minDeltaLimit > maxDeltaLimit) {
          minDeltaLimit = maxDeltaLimit
        }
      }
    }

    const clampedDelta = Math.max(minDeltaLimit, Math.min(delta, maxDeltaLimit))
    if (delta !== clampedDelta) {
      state.stickyScrollTop = scrollTop - clampedDelta + offsetTop
    }

    state.currentDelta = clampedDelta
    const baseTop = stickyTop > 0 ? stickyTop + offsetTop : 0
    el.style.top = `${baseTop - clampedDelta}px`
    state.lastScrollTop = scrollTop
  }

  update()

  scrollTarget.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)

  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
  resizeObserver?.observe(el)

  const mutationObserver =
    typeof MutationObserver !== 'undefined' && activeSelector
      ? new MutationObserver(update)
      : null
  mutationObserver?.observe(el, {
    attributes: true,
    subtree: true,
    attributeFilter: ['aria-current', 'data-active', 'class']
  })

  const destroy = () => {
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()
    scrollTarget.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    el.style.top = ''
  }

  return { update, destroy }
}
