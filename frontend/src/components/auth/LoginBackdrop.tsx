'use client';

import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * The backdrop images, served from `public/login/`. Replace the files and keep the names, or
 * change this list; one entry shows a still image, two or more cycle.
 */
const backdrops: readonly string[] = ['/login/backdrop_1.jpg', '/login/backdrop_2.jpg', '/login/backdrop_3.jpg'];

/** How long each image holds before the next fades in. */
const dwell_ms = 5_000;

/**
 * A faded photograph behind the door that changes every five seconds with a crossfade.
 *
 * Every image is in the tree at all times and only its opacity changes, so the swap is one
 * compositor transition and the next image is already decoded. Desaturated and held at a low
 * opacity from the theme, with a scrim that is solid behind the form and clears towards the far
 * edge, so the copy keeps the contrast the audit measured. The cycle stops when the tab is hidden
 * and never starts under reduced motion, where the first image stays as a still.
 *
 * @returns The layer, decorative and hidden from assistive tech.
 */
export function LoginBackdrop(): ReactNode {
  const [index, set_index] = useState(0);

  useEffect(() => {
    if (backdrops.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      set_index((current) => (current + 1) % backdrops.length);
    }, dwell_ms);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-backdrop={backdrops.length.toString()}>
      {backdrops.map((src, position) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          unoptimized
          priority={position === 0}
          sizes="100vw"
          className={`object-cover saturate-[.55] transition-opacity duration-[1400ms] ease-in-out ${
            position === index ? 'opacity-(--backdrop_opacity)' : 'opacity-0'
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-linear-to-r from-ground-deep from-35% via-ground-deep/70 via-60% to-ground-deep/15" />
    </div>
  );
}
