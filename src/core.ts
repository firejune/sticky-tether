export type StickyTetherStatus =
  | 'idle'
  | 'bypassed'
  | 'top-locked'
  | 'bottom-locked'
  | 'tethering'

export interface StickyTetherState {
  /** Current computed `top` offset in px (`baseTop - delta`). */
  top: number
  /** Base sticky top offset in px (`headerHeight + topPadding + offsetTop`). */
  baseTop: number
  /** Current upward scroll delta in px (`offsetTop <= delta <= maxDelta`). */
  delta: number
  /** Maximum upward scroll delta in px (`Math.max(0, el.offsetHeight - viewportHeight) + offsetTop`). */
  maxDelta: number
  /** Last observed scroll direction (`'up' | 'down'`). */
  direction: 'up' | 'down'
  /** High-level tethering status for UI indicators, shadows, or fade masks. */
  status: StickyTetherStatus
  /** Whether the parent container is taller than the sticky element so CSS sticky has scroll runway. */
  hasRunway: boolean
}

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
  /**
   * Optional callback invoked whenever the tether state changes.
   */
  onChange?: (state: StickyTetherState) => void
}

export interface StickyTetherInstance {
  /** Force a measurement and position update. */
  update: () => void
  /** Return the current tether state snapshot. */
  getState: () => StickyTetherState
  /** Disconnect all listeners and restore original inline `style.top` and `style.position`. */
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
    activeSelector = DEFAULT_ACTIVE_SELECTOR,
    onChange
  } = options

  const fallbackState: StickyTetherState = {
    top: 0,
    baseTop: 0,
    delta: offsetTop,
    maxDelta: offsetTop,
    direction: 'down',
    status: 'idle',
    hasRunway: true
  }

  const scrollTarget = resolveContainer(containerOption)
  if (!scrollTarget || typeof window === 'undefined') {
    return {
      update: () => {},
      getState: () => fallbackState,
      destroy: () => {}
    }
  }

  const initialStyleTop = el.style.top
  const initialStylePosition = el.style.position
  if (
    !el.style.position &&
    (typeof getComputedStyle !== 'function' ||
      getComputedStyle(el).position !== 'sticky')
  ) {
    el.style.position = 'sticky'
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
    currentDelta: offsetTop,
    warnedNoRunway: false,
    snapshot: { ...fallbackState }
  }

  const commitSnapshot = (next: StickyTetherState) => {
    const prev = state.snapshot
    const changed =
      prev.top !== next.top ||
      prev.baseTop !== next.baseTop ||
      prev.delta !== next.delta ||
      prev.maxDelta !== next.maxDelta ||
      prev.direction !== next.direction ||
      prev.status !== next.status ||
      prev.hasRunway !== next.hasRunway

    state.snapshot = next
    if (changed) {
      onChange?.(next)
    }
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
    const baseTop = stickyTop > 0 ? stickyTop + offsetTop : 0
    const idleTop = stickyTop > 0 ? stickyTop : 0
    const scrollTop = getScrollTop()
    const containerHeight = getContainerHeight()
    const viewportHeight = containerHeight - stickyTop - bottomPadding

    const direction: 'up' | 'down' =
      scrollTop > state.lastScrollTop
        ? 'down'
        : scrollTop < state.lastScrollTop
          ? 'up'
          : state.lastDirection

    const hasRunway =
      parent.offsetHeight <= 0 ||
      el.offsetHeight <= 0 ||
      parent.offsetHeight > el.offsetHeight

    if (
      !hasRunway &&
      el.offsetHeight > viewportHeight &&
      !state.warnedNoRunway &&
      typeof console !== 'undefined' &&
      typeof console.warn === 'function'
    ) {
      state.warnedNoRunway = true
      console.warn(
        '[sticky-tether] The sticky element’s parent has no scroll runway (parent.offsetHeight <= el.offsetHeight). Ensure the parent container stretches to the full content height (e.g. avoid "align-items: start" on a parent Grid/Flex container).'
      )
    }

    // Element fits inside the viewport (or is hidden): pin at idleTop so CSS doesn't need a duplicate top rule
    if (el.offsetHeight <= 0 || el.offsetHeight <= viewportHeight) {
      el.style.top = el.offsetHeight > 0 && idleTop > 0 ? `${idleTop}px` : ''
      state.isSticky = false
      state.currentDelta = offsetTop
      state.lastDirection = direction
      state.lastScrollTop = scrollTop
      commitSnapshot({
        top: idleTop,
        baseTop,
        delta: offsetTop,
        maxDelta: offsetTop,
        direction,
        status: 'bypassed',
        hasRunway
      })
      return
    }

    const maxDelta = el.offsetHeight - viewportHeight + offsetTop

    // Parent content box has not reached the sticky threshold yet (accounting for parent padding-top)
    const containerTop = isWindow
      ? 0
      : (scrollTarget as HTMLElement).getBoundingClientRect().top
    const parentPaddingTop =
      typeof getComputedStyle === 'function'
        ? Number.parseFloat(getComputedStyle(parent).paddingTop) || 0
        : 0
    const parentContentTop =
      parent.getBoundingClientRect().top + parentPaddingTop - containerTop

    if (parentContentTop - stickyTop >= 0) {
      el.style.top = idleTop > 0 ? `${idleTop}px` : ''
      state.isSticky = false
      state.currentDelta = offsetTop
      state.lastDirection = direction
      state.lastScrollTop = scrollTop
      commitSnapshot({
        top: idleTop,
        baseTop,
        delta: offsetTop,
        maxDelta,
        direction,
        status: 'idle',
        hasRunway
      })
      return
    }

    // Re-anchor on initial sticky activation or scroll direction reversal
    if (!state.isSticky || direction !== state.lastDirection) {
      const anchorScrollTop = state.isSticky ? state.lastScrollTop : scrollTop
      state.stickyScrollTop = anchorScrollTop - state.currentDelta + offsetTop
      state.isSticky = true
      state.lastDirection = direction
    }

    const delta = scrollTop - state.stickyScrollTop + offsetTop

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
    const computedTop = baseTop - clampedDelta
    el.style.top = `${computedTop}px`
    state.lastScrollTop = scrollTop

    const status: StickyTetherStatus =
      Math.abs(clampedDelta - maxDelta) <= 1 && maxDelta > offsetTop
        ? 'bottom-locked'
        : Math.abs(clampedDelta - offsetTop) <= 1
          ? 'top-locked'
          : 'tethering'

    commitSnapshot({
      top: computedTop,
      baseTop,
      delta: clampedDelta,
      maxDelta,
      direction,
      status,
      hasRunway
    })
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
    el.style.top = initialStyleTop
    el.style.position = initialStylePosition
  }

  return {
    update,
    getState: () => state.snapshot,
    destroy
  }
}
