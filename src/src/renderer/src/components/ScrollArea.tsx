import { forwardRef } from 'react'
import { OverlayScrollbarsComponent, OverlayScrollbarsComponentRef } from 'overlayscrollbars-react'
import type { ComponentPropsWithoutRef } from 'react'

type ScrollAreaProps = ComponentPropsWithoutRef<'div'> & {
  /** Extra classes for the inner viewport (the scrollable element) */
  viewportClassName?: string
}

/**
 * A drop-in replacement for scrollable containers.
 * Uses OverlayScrollbars under the hood – no native scrollbar arrows, accent-colored thumb.
 */
export const ScrollArea = forwardRef<OverlayScrollbarsComponentRef, ScrollAreaProps>(
  ({ children, className, viewportClassName, ...rest }, ref) => {
    return (
      <OverlayScrollbarsComponent
        ref={ref}
        className={className}
        options={{
          scrollbars: {
            theme: 'os-theme-riescade',
            autoHide: 'move',
            autoHideDelay: 800,
            clickScroll: true
          },
          overflow: { x: 'hidden', y: 'scroll' }
        }}
        defer
        {...rest}
      >
        {children}
      </OverlayScrollbarsComponent>
    )
  }
)

ScrollArea.displayName = 'ScrollArea'

/** Variant that allows both axes */
export const ScrollAreaBoth = forwardRef<OverlayScrollbarsComponentRef, ScrollAreaProps>(
  ({ children, className, viewportClassName, ...rest }, ref) => {
    return (
      <OverlayScrollbarsComponent
        ref={ref}
        className={className}
        options={{
          scrollbars: {
            theme: 'os-theme-riescade',
            autoHide: 'move',
            autoHideDelay: 800,
            clickScroll: true
          },
          overflow: { x: 'scroll', y: 'scroll' }
        }}
        defer
        {...rest}
      >
        {children}
      </OverlayScrollbarsComponent>
    )
  }
)

ScrollAreaBoth.displayName = 'ScrollAreaBoth'
