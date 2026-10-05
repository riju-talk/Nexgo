// A restrained workspace surface behind all in-app content. It deliberately
// avoids imagery so operational data stays easy to scan at every viewport.
export default function ScenicBackdrop() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: 'var(--nx-workspace-bg)',
        pointerEvents: 'none',
      }}
    />
  );
}
