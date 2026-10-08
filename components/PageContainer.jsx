'use client';

// The one place that decides how wide a page body is and where it sits: every page rendered by AppPage goes
// inside this container, so content is centred under the page header and shares the same left/right edges.
export const PAGE_MAX_WIDTH = 1320;
export const ADMIN_PAGE_MAX_WIDTH = 1560;
const DESKTOP_PAGE_GUTTER = 28;

export default function PageContainer({ children, admin = false }) {
  const contentMax = admin ? ADMIN_PAGE_MAX_WIDTH : PAGE_MAX_WIDTH;
  return (
    <div style={{ width: '100%', maxWidth: contentMax + DESKTOP_PAGE_GUTTER * 2, marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box', flex: '1 0 auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {children}
    </div>
  );
}
