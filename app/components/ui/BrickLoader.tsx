'use client';

import { cva, type VariantProps } from 'class-variance-authority';

const brickLoaderVariants = cva('relative', {
  variants: {
    size: {
      sm: '[--brick-size:48px]',
      md: '[--brick-size:64px]',
      lg: '[--brick-size:96px]',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

type BrickLoaderProps = VariantProps<typeof brickLoaderVariants> & {
  label?: string;
  className?: string;
};

type BrickColor = 'red' | 'yellow' | 'blue';

const BRICK_COLORS: Record<
  BrickColor,
  { base: string; dark: string; medium: string }
> = {
  red: {
    base: '#f2130d',
    dark: '#bd2720',
    medium: '#e6231a',
  },
  yellow: {
    base: '#f2cb0d',
    dark: '#bca117',
    medium: '#e6c31a',
  },
  blue: {
    base: '#1c0df2',
    dark: '#2d20bd',
    medium: '#231ae6',
  },
};

/**
 * Single isometric 2x2 brick drawn at origin (0,0).
 * All positioning is handled by CSS transforms on the container.
 */
function IsoBrick({ color }: { color: BrickColor }) {
  const colors = BRICK_COLORS[color];

  return (
    <g>
      {/* Top diamond face */}
      <path
        fill={colors.base}
        d="M0,0l152.95,76.47-152.95,76.47-152.95-76.47L0,0Z"
      />
      {/* Stud 1 (front) */}
      <path
        fill={colors.dark}
        d="M33.96,100.37v14.34h-.1c0,4.33-3.3,8.67-9.91,11.97-13.22,6.61-34.68,6.61-47.89,0-6.61-3.3-9.91-7.64-9.91-11.97v-14.34h.1c0,4.33,3.3,8.67,9.91,11.97,13.22,6.61,34.68,6.61,47.89,0,6.61-3.3,9.91-7.64,9.91-11.97h0Z"
      />
      {/* Stud 2 (back-left) */}
      <path
        fill={colors.dark}
        d="M-37.78,64.5h.1v14.34h-.19c0,4.33-3.3,8.67-9.91,11.97-13.22,6.61-34.68,6.61-47.89,0-7.26-3.63-10.53-8.5-9.82-13.26v-13.06c0,4.33,3.3,8.67,9.91,11.97,13.22,6.61,34.68,6.61,47.89,0,6.61-3.3,9.91-7.64,9.91-11.97h0Z"
      />
      {/* Stud 3 (back-right) */}
      <path
        fill={colors.dark}
        d="M105.7,64.5v14.34h-.1c0,4.33-3.3,8.67-9.91,11.97-13.22,6.61-34.68,6.61-47.89,0-6.61-3.3-9.91-7.64-9.91-11.97v-14.34h.1c0,4.33,3.3,8.67,9.91,11.97,13.22,6.61,34.68,6.61,47.89,0,6.61-3.3,9.91-7.64,9.91-11.97h0Z"
      />
      {/* Stud 4 (center-back) */}
      <path
        fill={colors.dark}
        d="M33.96,28.63v14.34h-.1c0,4.33-3.3,8.67-9.91,11.97-13.22,6.61-34.68,6.61-47.89,0-6.61-3.3-9.91-7.64-9.91-11.97v-14.34h.1c0,4.33,3.3,8.67,9.91,11.97,13.22,6.61,34.68,6.61,47.89,0,6.61-3.3,9.91-7.64,9.91-11.97h0Z"
      />
      {/* Right wall */}
      <path
        fill={colors.dark}
        d="M152.95,76.47v114.71l-152.95,76.47v-114.71l152.95-76.47h0Z"
      />
      {/* Left wall */}
      <path
        fill={colors.medium}
        d="M-152.94,76.47v114.71l152.95,76.47v-114.71l-152.95-76.47h0Z"
      />
    </g>
  );
}

/**
 * Isometric brick loading spinner.
 * Three bricks chase each other around a diamond pattern.
 *
 * Z-index by position:
 * - BOTTOM: 4 (frontmost)
 * - RIGHT: 3
 * - LEFT: 2
 * - TOP: 1 (backmost)
 */
export function BrickLoader({ size, label, className }: BrickLoaderProps) {
  return (
    <div
      className={brickLoaderVariants({ size, className })}
      role="status"
      aria-live="polite"
    >
      <div
        className="relative overflow-visible"
        style={{
          width: 'var(--brick-size)',
          height: 'calc(var(--brick-size) * 0.8)',
        }}
      >
        {/* Red brick - starts at TOP position */}
        <div
          className="animate-brick-red absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          <svg
            viewBox="-200 -50 400 320"
            className="h-full w-full overflow-visible"
          >
            <IsoBrick color="red" />
          </svg>
        </div>

        {/* Yellow brick - starts at RIGHT position */}
        <div
          className="animate-brick-yellow absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          <svg
            viewBox="-200 -50 400 320"
            className="h-full w-full overflow-visible"
          >
            <IsoBrick color="yellow" />
          </svg>
        </div>

        {/* Blue brick - starts at BOTTOM position */}
        <div
          className="animate-brick-blue absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          <svg
            viewBox="-200 -50 400 320"
            className="h-full w-full overflow-visible"
          >
            <IsoBrick color="blue" />
          </svg>
        </div>
      </div>

      {label ? (
        <span className="mt-2 block text-center text-sm text-foreground-muted">
          {label}
        </span>
      ) : null}
    </div>
  );
}
