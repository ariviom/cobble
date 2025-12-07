import Image, { type ImageProps } from 'next/image';

import { getImageSizeConfig, type ImageVariant } from '@/app/config/imageSizes';

type OptimizedImageProps = {
  src: string | null | undefined;
  alt: string;
  variant: ImageVariant;
  className?: string;
  priority?: boolean;
  sizesOverride?: string;
  qualityOverride?: number;
} & Omit<
  ImageProps,
  'src' | 'alt' | 'width' | 'height' | 'sizes' | 'quality' | 'priority'
>;

/**
 * Thin wrapper around next/image that applies consistent sizing, quality, and
 * fallbacks for our catalog images.
 */
export function OptimizedImage({
  src,
  alt,
  variant,
  className,
  priority,
  sizesOverride,
  qualityOverride,
  ...rest
}: OptimizedImageProps) {
  if (!src) {
    return (
      <div className={className}>
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  const { width, height, sizes, quality } = getImageSizeConfig(variant);
  const finalQuality = qualityOverride ?? quality;

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizesOverride ?? sizes}
      {...(finalQuality !== undefined ? { quality: finalQuality } : {})}
      className={className}
      priority={priority === true}
      {...rest}
    />
  );
}
