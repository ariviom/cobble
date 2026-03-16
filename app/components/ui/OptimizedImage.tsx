'use client';

import Image, { type ImageProps } from 'next/image';
import { useCallback, useState } from 'react';

import { getImageSizeConfig, type ImageVariant } from '@/app/config/imageSizes';
import { Skeleton } from '@/app/components/ui/Skeleton';
import { cn } from '@/app/components/ui/utils';

type OptimizedImageProps = {
  src: string | null | undefined;
  alt: string;
  variant: ImageVariant;
  className?: string;
  priority?: boolean;
  sizesOverride?: string;
  /** Disable fade-in animation (e.g., for above-the-fold images) */
  disableFade?: boolean;
} & Omit<ImageProps, 'src' | 'alt' | 'width' | 'height' | 'sizes' | 'priority'>;

/**
 * Thin wrapper around next/image that applies consistent sizing, quality, and
 * fallbacks for our catalog images. Includes a fade-in animation on load.
 */
export function OptimizedImage({
  src,
  alt,
  variant,
  className,
  priority,
  sizesOverride,
  disableFade,
  onLoad,
  ...rest
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      setIsLoaded(true);
      onLoad?.(event);
    },
    [onLoad]
  );

  if (!src) {
    return (
      <div className={className}>
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  const { width, height, sizes } = getImageSizeConfig(variant);
  const shouldFade = !disableFade && !priority;

  return (
    <div className="relative size-full">
      {shouldFade && !isLoaded && (
        <Skeleton variant="image" className="absolute inset-0 h-full w-full" />
      )}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizesOverride ?? sizes}
        className={cn(
          className,
          shouldFade && 'transition-opacity duration-200',
          shouldFade && !isLoaded && 'opacity-0'
        )}
        priority={priority === true}
        onLoad={handleLoad}
        {...rest}
      />
    </div>
  );
}
