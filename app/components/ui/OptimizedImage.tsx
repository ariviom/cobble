'use client';

import Image, { type ImageProps } from 'next/image';
import { useCallback, useState } from 'react';

import { getImageSizeConfig, type ImageVariant } from '@/app/config/imageSizes';
import { cn } from '@/app/components/ui/utils';

type OptimizedImageProps = {
  src: string | null | undefined;
  alt: string;
  variant: ImageVariant;
  className?: string;
  priority?: boolean;
  sizesOverride?: string;
  qualityOverride?: number;
  /** Disable fade-in animation (e.g., for above-the-fold images) */
  disableFade?: boolean;
} & Omit<
  ImageProps,
  'src' | 'alt' | 'width' | 'height' | 'sizes' | 'quality' | 'priority'
>;

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
  qualityOverride,
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

  const { width, height, sizes, quality } = getImageSizeConfig(variant);
  const finalQuality = qualityOverride ?? quality;
  const shouldFade = !disableFade && !priority;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizesOverride ?? sizes}
      {...(finalQuality !== undefined ? { quality: finalQuality } : {})}
      className={cn(
        className,
        shouldFade && 'transition-opacity duration-200',
        shouldFade && !isLoaded && 'opacity-0'
      )}
      priority={priority === true}
      onLoad={handleLoad}
      {...rest}
    />
  );
}
