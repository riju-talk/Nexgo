'use client';

import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

// The top-bar search field: a real input, so text can be typed and pasted straight into it.
// Results are drawn by <CommandPalette /> below it; arrow keys / Enter / Esc are forwarded as an event.
export default function SearchBox({ placeholder, height = 38, radius = 10, compact = false }) {
  const { paletteQuery, setPaletteQuery, setPaletteOpen } = useAppState();
  const onKeyDown = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      if (e.key !== 'Escape') e.preventDefault();
      window.dispatchEvent(new CustomEvent('nx-search-key', { detail: e.key }));
    }
  };
  return (
    <label style={{ flex: 1, maxWidth: compact ? 'none' : 580, margin: compact ? 0 : '0 auto', height, background: 'var(--nx-chrome-search)', border: '1px solid var(--nx-chrome-border)', borderRadius: radius, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', color: 'var(--nx-chrome-muted)', cursor: 'text', minWidth: 0 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: '0 0 15px' }}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
      <input
        id="nx-search" type="text" autoComplete="off" spellCheck={false} aria-label="Search"
        value={paletteQuery} placeholder={placeholder}
        onChange={(e) => { setPaletteQuery(e.target.value); setPaletteOpen(true); }}
        onFocus={() => setPaletteOpen(true)} onKeyDown={onKeyDown}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--nx-chrome-text)', font: 'inherit' }}
      />
      {paletteQuery
        ? <button type="button" aria-label="Clear search" onClick={() => { setPaletteQuery(''); document.getElementById('nx-search')?.focus(); }} style={{ border: 0, background: 'transparent', color: 'var(--nx-chrome-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        : !compact && <span style={{ fontFamily: T.MONO, fontSize: 10.5, fontWeight: 650, border: '1px solid var(--nx-chrome-border)', borderRadius: 5, padding: '2px 5px', whiteSpace: 'nowrap' }}>⌘ K</span>}
    </label>
  );
}
