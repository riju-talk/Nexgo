// Design tokens ported from the NEXGO Claude Design prototype (Shell C craft).
//
// Brand/semantic colors (NAVY, ACCENT, GREEN, AMBER, RED, MUTE) stay fixed
// hex across light/dark — they're vivid enough to read on both, and some
// call sites concatenate a hex alpha suffix onto them (e.g. `${T.GREEN}17`),
// which only works with a literal hex string, not a CSS var() reference.
//
// Structural/neutral tokens (surfaces, borders, text) DO need to invert for
// dark mode, so those resolve to CSS custom properties defined in
// globals.css (`:root` for light, `[data-theme="dark"]` for dark) and are
// flipped at runtime by lib/ThemeContext.jsx.
export const NAVY = '#0F1F3D';
export const SIDEBAR_NAVY = '#0C1A33';
export const ACCENT = '#00B3A4';

export const GREEN = '#14724F';
export const AMBER = '#8A5A00';
export const RED = '#B23A2B';
export const MUTE = '#8C8778';

export const SURFACE = 'var(--nx-surface)';
export const SURFACE_SOFT = 'var(--nx-surface-soft)';
export const PAPER = 'var(--nx-paper)';
export const PANEL = 'var(--nx-panel)';

export const BORDER = 'var(--nx-border)';
export const DIVIDER = 'var(--nx-divider)';
export const INPUT_BORDER = 'var(--nx-input-border)';
export const ROW_DIVIDER = 'var(--nx-row-divider)';
export const MENU_BORDER = 'var(--nx-menu-border)';

export const TEXT = 'var(--nx-text)';
export const TEXT_LABEL = 'var(--nx-text-label)';
export const TEXT_SECONDARY = 'var(--nx-text-secondary)';
export const TEXT_MUTED = 'var(--nx-text-muted)';
export const TEXT_FAINT = 'var(--nx-text-faint)';
export const TABLE_HEAD = 'var(--nx-table-head)';
export const TABLE_HEAD_BG = 'var(--nx-table-head-bg)';
export const SECTION_HEAD = 'var(--nx-section-head)';

export const SIDEBAR_TEXT = '#D3DCE9';
export const SIDEBAR_TEXT_DIM = '#A7B7CE';
export const SIDEBAR_LABEL = '#7189AE';
export const SIDEBAR_SUB = '#8298B8';
export const SIDEBAR_MUTED = '#6E86AB';
export const SIDEBAR_FAINT = '#5F779C';
export const SIDEBAR_LINE = '#3A5178';

export const SANS = "var(--font-sans), sans-serif";
export const MONO = "var(--font-mono), monospace";

export const MOBILE_BREAK = 980;
export const PHONE_BREAK = 640;
export const NARROW_BREAK = 1280;
