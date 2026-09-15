import { Suspense } from 'react';
import { BlotterScreen } from '@/components/blotter/BlotterScreen';
import { BlotterSkeleton } from '@/components/blotter/BlotterSkeleton';

// The blotter reads its filters from the URL, which needs a Suspense boundary above the client
// component so the page can still be prerendered as a shell.
export default function BlotterPage() {
  return (
    <Suspense fallback={<BlotterSkeleton />}>
      <BlotterScreen />
    </Suspense>
  );
}
