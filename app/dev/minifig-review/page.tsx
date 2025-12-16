'use client';

import { MinifigReviewClient } from './MinifigReviewClient';

export default function MinifigReviewPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-500">
          This page is only available in development mode.
        </p>
      </div>
    );
  }

  return <MinifigReviewClient />;
}
