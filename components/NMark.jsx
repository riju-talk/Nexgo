import Image from 'next/image';

// The NEXGO "N" mark on a white tile (the mark has navy inside it, so it needs a light backing on dark UI).
export default function NMark({ size = 32, tile = true }) {
  const img = (
    <Image src="/nexgo-mark.png" alt="" width={428} height={364} style={{ width: Math.round(size * 0.72), height: 'auto', display: 'block' }} />
  );
  if (!tile) return img;
  return (
    <div aria-hidden="true" style={{ width: size, height: size, flex: `0 0 ${size}px`, borderRadius: Math.round(size * 0.28), background: '#fff', display: 'grid', placeItems: 'center' }}>
      {img}
    </div>
  );
}
