import { BrickLoader } from '@/app/components/ui/BrickLoader';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrickLoader size="lg" />
    </div>
  );
}
