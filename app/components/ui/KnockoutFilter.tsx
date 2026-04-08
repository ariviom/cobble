'use client';

/**
 * Hidden SVG filter that maps near-white pixels to transparent.
 * Only mounted when the user opts in via the experimental setting.
 * The CSS rule `.dark img[data-knockout='true']` in globals.css
 * references `url('#knockout-white')` — when this SVG is absent,
 * the filter is a no-op.
 */
export function KnockoutFilter() {
  return (
    <svg
      width="0"
      height="0"
      className="absolute"
      aria-hidden="true"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      <filter id="knockout-white" colorInterpolationFilters="sRGB">
        {/* Convert RGB to luminance (grayscale) */}
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0 0
                  0.299 0.587 0.114 0 0"
          result="luma"
        />
        {/* Threshold: luminance > ~0.97 → transparent, smooth fade from ~0.92 */}
        <feComponentTransfer in="luma" result="mask">
          <feFuncA type="linear" slope={-20} intercept={19.4} />
        </feComponentTransfer>
        {/* Composite: use original color with the computed alpha mask */}
        <feComposite in="SourceGraphic" in2="mask" operator="in" />
      </filter>
    </svg>
  );
}
