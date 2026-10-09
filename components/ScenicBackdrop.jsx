// The workspace surface now lives on the AppShell scroll container (background: var(--nx-workspace-bg)).
// This used to be a full-viewport position:fixed layer, which painted over the browser scrollbar and made
// it invisible on every page that rendered it. Kept as a no-op so existing call sites stay valid.
export default function ScenicBackdrop() {
  return null;
}
