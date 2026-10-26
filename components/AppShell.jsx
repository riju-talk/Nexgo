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
import ImpersonationBanner from './ImpersonationBanner';
import SessionHeartbeat from './SessionHeartbeat';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const activeId = idForPath(pathname);
  const { vw } = useAppState();
  const mobile = vw <= MOBILE_BREAK;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') return <AdminShell>{children}</AdminShell>;

  return (
    <div style={{ '--ac': '#3877fc', height: '100vh', minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: PAPER, color: TEXT }}>
      <SessionHeartbeat loginPath="/login" />
      <ImpersonationBanner />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
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
