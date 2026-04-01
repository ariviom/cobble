export function getTourVideoUrl(videoKey: string, isDesktop: boolean): string {
  const variant = isDesktop ? 'desktop' : 'mobile';
  return `/tour-videos/${videoKey}_${variant}.mp4`;
}
