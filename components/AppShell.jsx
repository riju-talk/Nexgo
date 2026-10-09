'use client';

import { usePathname } from 'next/navigation';
import { idForPath } from '@/lib/routes';
import { useAppState } from '@/lib/AppStateContext';
import { MOBILE_BREAK, PAPER, TEXT } from '@/lib/theme';
import Sidebar from './Sidebar';
import MobileOverlay from './MobileOverlay';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import NdrDrawer from './NdrDrawer';
import Toast from './Toast';
import AdminShell from './AdminShell';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const activeId = idForPath(pathname);
  const { vw } = useAppState();
  const mobile = vw <= MOBILE_BREAK;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') return <AdminShell>{children}</AdminShell>;

  return (
    <div style={{ '--ac': '#1b9fd6', height: '100vh', minHeight: 0, minWidth: 0, overflow: 'hidden', background: PAPER, color: TEXT }}>
      <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
        <MobileOverlay mobile={mobile} />
        <Sidebar activeId={activeId} mobile={mobile} />
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'scroll', overflowX: 'hidden', background: 'var(--nx-workspace-bg)' }}>
          <TopBar activeId={activeId} mobile={mobile} />
          {children}
        </div>
        <NdrDrawer />
        <CommandPalette />
        <Toast />
      </div>
    </div>
  );
}
