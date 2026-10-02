'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-transparency: reduce)';

function subscribe(cb) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

// Mirrors prefers-reduced-motion handling but for translucent materials:
// callers should fall back to a near-solid background and drop the blur.
export function useReducedTransparency() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
