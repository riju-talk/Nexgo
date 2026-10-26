'use client';

import { useEffect, useRef } from 'react';
import { API_BASE, SESSION_EXPIRED_EVENT } from '@/lib/api';

const BEAT_MS = 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'];

// Keeps the sign-in honest while the app is open. Once a minute (and whenever the tab becomes visible again) it asks the
// API whether the session is still good and tells it whether the user actually did anything since the last beat, so a tab
// left open and untouched is signed out after the idle timeout instead of staying logged in forever. Any 401 anywhere in
// the app (lib/api.js raises SESSION_EXPIRED_EVENT) lands here too and sends the user to the sign-in page.
export default function SessionHeartbeat({ loginPath }) {
  const active = useRef(true);

  useEffect(() => {
    let stopped = false;
    const leave = (reason) => {
      if (stopped) return;
      stopped = true;
      const why = reason === 'SESSION_IDLE_TIMEOUT' ? 'idle' : 'expired';
      window.location.assign(`${loginPath}?reason=${why}`); // eslint-disable-line @next/next/no-location-assign-relative-destination -- full reload drops all in-memory client state
    };
    const markActive = () => { active.current = true; };
    const beat = async () => {
      if (stopped) return;
      const wasActive = active.current;
      active.current = false;
      try {
        const response = await fetch(`${API_BASE}/v1/auth/heartbeat`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: wasActive }),
        });
        if (response.status === 401) {
          const body = await response.json().catch(() => null);
          leave(body?.error);
        }
      } catch { /* offline or API restarting: try again on the next beat */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    const onExpired = (event) => leave(event.detail?.reason);

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    const timer = window.setInterval(beat, BEAT_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [loginPath]);

  return null;
}
