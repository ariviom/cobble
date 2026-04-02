'use client';

import type { LucideIcon } from 'lucide-react';

type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  videoSrc?: string;
  imageSrc?: string;
  variant?: 'default' | 'plus';
};

export function FeatureCard({
  icon: Icon,
  title,
  description,
  videoSrc,
  imageSrc,
  variant = 'default',
}: FeatureCardProps) {
  const isPlus = variant === 'plus';

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-lg border shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
        isPlus
          ? 'border-white/20 bg-white/10 backdrop-blur-sm'
          : 'border-subtle bg-card'
      }`}
    >
      {/* Video preview area */}
      <div
        className={`relative aspect-video w-full overflow-hidden ${
          isPlus ? 'bg-white/5' : 'bg-neutral-100 dark:bg-neutral-200'
        }`}
      >
        {videoSrc ? (
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        ) : imageSrc ? (
          <img
            src={imageSrc}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon
              className={`size-10 ${isPlus ? 'text-white/40' : 'text-neutral-300 dark:text-neutral-400'}`}
              strokeWidth={1.5}
            />
          </div>
        )}
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col p-5">
        <h3
          className={`text-lg font-bold ${isPlus ? 'text-white' : 'text-foreground'}`}
        >
          {title}
        </h3>
        <p
          className={`mt-2 text-sm leading-relaxed ${
            isPlus ? 'text-white/70' : 'text-foreground-muted'
          }`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
