import React, { useEffect, useRef } from 'react'

import { createStickyTether, type StickyTetherOptions } from './core'

/**
 * React hook for bi-directional sticky scroll tethering with active-item viewport guard.
 *
 * @example
 * ```tsx
 * const asideRef = useStickyTether({ topPadding: 30, bottomPadding: 24, defaultHeaderHeight: 54 })
 * return <aside ref={asideRef} style={{ position: 'sticky' }}>...</aside>
 * ```
 */
export function useStickyTether<T extends HTMLElement = HTMLElement>(
  options: StickyTetherOptions | number = {}
) {
  const normalizedOptions: StickyTetherOptions =
    typeof options === 'number' ? { offsetTop: options } : options

  const {
    topPadding,
    bottomPadding,
    offsetTop,
    headerHeight,
    defaultHeaderHeight,
    container,
    activeSelector
  } = normalizedOptions

  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!ref.current) return

    const instance = createStickyTether(ref.current, {
      topPadding,
      bottomPadding,
      offsetTop,
      headerHeight,
      defaultHeaderHeight,
      container,
      activeSelector
    })

    return () => {
      instance.destroy()
    }
  }, [
    topPadding,
    bottomPadding,
    offsetTop,
    headerHeight,
    defaultHeaderHeight,
    container,
    activeSelector
  ])

  return ref
}

/** Alias of `useStickyTether`. */
export const useTether = useStickyTether

export interface StickyTetherProps
  extends StickyTetherOptions,
    Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /**
   * HTML tag to render.
   * @default 'aside'
   */
  as?: React.ElementType
  children?: React.ReactNode
}

/**
 * Declarative wrapper component for `useStickyTether`.
 */
export const StickyTether = React.forwardRef<HTMLElement, StickyTetherProps>(
  function StickyTether(
    {
      as: Component = 'aside',
      topPadding,
      bottomPadding,
      offsetTop,
      headerHeight,
      defaultHeaderHeight,
      container,
      activeSelector,
      style,
      children,
      ...rest
    },
    forwardedRef
  ) {
    const innerRef = useStickyTether<HTMLElement>({
      topPadding,
      bottomPadding,
      offsetTop,
      headerHeight,
      defaultHeaderHeight,
      container,
      activeSelector
    })

    const mergedRef = (node: HTMLElement | null) => {
      ;(innerRef as React.MutableRefObject<HTMLElement | null>).current = node
      if (typeof forwardedRef === 'function') {
        forwardedRef(node)
      } else if (forwardedRef) {
        ;(forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node
      }
    }

    return (
      <Component
        ref={mergedRef}
        style={{ position: 'sticky', ...style }}
        {...rest}
      >
        {children}
      </Component>
    )
  }
)
