'use client';

import { TABLES, FORMS, CONNECTORS } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import { MOBILE_BREAK, NARROW_BREAK, PHONE_BREAK } from '@/lib/theme';
import PageHeader from './PageHeader';
import DashboardContent from './DashboardContent';
import TablePage from './TablePage';
import FormPage from './FormPage';
import AccountConfiguration from './AccountConfiguration';
import AdminDashboard from './AdminDashboard';
import AdminPageHeader from './AdminPageHeader';
import AdminUtilityPage from './AdminUtilityPage';
import LiveSellerOperations from './LiveSellerOperations';
import LiveAdminQueues from './LiveAdminQueues';
import LiveCreateOrder from './LiveCreateOrder';
import LiveSellerWorkspace from './LiveSellerWorkspace';
import LiveAdminOperations from './LiveAdminOperations';

export default function AppPage({ id, isDashboard = false }) {
  const { vw } = useAppState();
  const mobile = vw <= MOBILE_BREAK;
  const phone = vw <= PHONE_BREAK;
  const narrow = vw <= NARROW_BREAK;

  const hasTable = !!TABLES[id];
  const hasForm = !isDashboard && !hasTable && !!(FORMS[id] || CONNECTORS[id]);
  const isAccountConfig = id === 'account-config';
  const isAdminOverview = id === 'a-overview';
  const isAdminPage = id.startsWith('a-');
  const isLiveSellerPage = ['orders', 'shipments', 'ndr', 'wallet'].includes(id);
  const isLiveAdminPage = ['a-sellers', 'a-shipments', 'a-ndr', 'a-couriers'].includes(id);
  const isLiveCreateOrder = id === 'b2c';
  const isLiveSellerWorkspace = ['recharges', 'warehouse', 'profile', 'kyc', 'invoice', 'cod', 'shopify', 'woo', 'magento', 'amazon'].includes(id);
  const isLiveAdminOperations = ['a-kyc', 'a-cod', 'a-invoices', 'a-jobs', 'a-audit'].includes(id);
  const isAdminUtility = isAdminPage && !isAdminOverview && !hasTable;

  return (
    <>
      {!isAccountConfig && !isAdminOverview && !isAdminPage && <PageHeader activeId={id} isDashboard={isDashboard} mobile={mobile} phone={phone} />}
      {isAdminPage && !isAdminOverview && <AdminPageHeader activeId={id} phone={phone} />}
      {isAdminOverview && <AdminDashboard mobile={mobile} phone={phone} />}
      {isDashboard && !isAdminOverview && <DashboardContent mobile={mobile} narrow={narrow} phone={phone} />}
      {isLiveSellerPage && <LiveSellerOperations activeId={id} mobile={mobile} />}
      {isLiveAdminPage && <LiveAdminQueues activeId={id} mobile={mobile} />}
      {isLiveCreateOrder && <LiveCreateOrder mobile={mobile} />}
      {isLiveSellerWorkspace && <LiveSellerWorkspace activeId={id} mobile={mobile} />}
      {isLiveAdminOperations && <LiveAdminOperations activeId={id} mobile={mobile} />}
      {hasTable && !isAdminOverview && !isLiveSellerPage && !isLiveAdminPage && !isLiveSellerWorkspace && <TablePage activeId={id} mobile={mobile} phone={phone} />}
      {hasForm && !isLiveCreateOrder && !isLiveSellerWorkspace && <FormPage activeId={id} mobile={mobile} phone={phone} />}
      {isAdminUtility && !isLiveAdminOperations && <AdminUtilityPage activeId={id} mobile={mobile} />}
      {isAccountConfig && <AccountConfiguration mobile={mobile} phone={phone} />}
    </>
  );
}
