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
import LiveWorkspaceTools from './LiveWorkspaceTools';
import LiveAdminReports from './LiveAdminReports';
import LiveMarketing from './LiveMarketing';
import LiveSellerSecurity from './LiveSellerSecurity';
import LiveShipmentDetail from './LiveShipmentDetail';
import CreateOrder from './CreateOrder';
import LiveBilling from './LiveBilling';
import LiveBillingDocs from './LiveBillingDocs';
import LiveTrack from './LiveTrack';
import ComingSoon from './ComingSoon';

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
  const isLiveSellerPage = ['orders', 'ndr', 'wallet'].includes(id);
  const isLiveAdminPage = ['a-sellers', 'a-orders', 'a-shipments', 'a-ndr', 'a-rto', 'a-pickups', 'a-couriers'].includes(id);
  const isCreateOrder = id === 'b2c' || id === 'bulk-orders';
  const isLiveCreateOrder = ['dropship', 'shipnow', 'reverse'].includes(id);
  const isLiveBilling = id === 'billing';
  const isBillingDoc = id === 'credit-note' || id === 'tds';
  const isTrack = id === 'shipments';
  const isComingSoon = id === 'b2b';
  const isLiveMarketing = ['whatsapp', 'email'].includes(id);
  const isLiveSellerSecurity = id === 'password';
  const isLiveShipmentDetail = id === 'ship-detail';
  const isLiveSellerWorkspace = ['recharges', 'warehouse', 'team', 'kyc', 'invoice', 'cod', 'charges', 'shopify', 'woo', 'magento', 'opencart', 'amazon', 'ratecalc', 'ratecard', 'pincode'].includes(id);
  const isLiveAdminOperations = ['a-kyc', 'a-wallets', 'a-cod', 'a-invoices', 'a-jobs', 'a-audit'].includes(id);
  const isLiveWorkspaceTool = ['courier-rules', 'label', 'printer', 'inv-settings', 'notifications', 'mis', 'weight', 'a-tickets', 'wa-api', 'sms-api', 'abandoned', 'email-reports', 'profile'].includes(id);
  const isLiveAdminReport = ['a-revenue', 'a-sla-report', 'a-analytics', 'a-gst'].includes(id);
  const isAdminUtility = isAdminPage && !isAdminOverview && !hasTable && !isLiveAdminReport;

  return (
    <>
      {!isAccountConfig && !isAdminOverview && !isAdminPage && <PageHeader activeId={id} isDashboard={isDashboard} mobile={mobile} phone={phone} />}
      {isAdminPage && !isAdminOverview && <AdminPageHeader activeId={id} phone={phone} />}
      {isAdminOverview && <AdminDashboard mobile={mobile} phone={phone} />}
      {isDashboard && !isAdminOverview && <DashboardContent mobile={mobile} narrow={narrow} phone={phone} />}
      {isLiveSellerPage && <LiveSellerOperations activeId={id} mobile={mobile} />}
      {isLiveAdminPage && <LiveAdminQueues activeId={id} mobile={mobile} />}
      {isCreateOrder && <CreateOrder tab={id === 'bulk-orders' ? 'bulk' : 'single'} mobile={mobile} />}
      {isLiveCreateOrder && <LiveCreateOrder mobile={mobile} flow={id === 'shipnow' ? 'ship_now' : id} />}
      {isLiveBilling && <LiveBilling mobile={mobile} />}
      {isBillingDoc && <LiveBillingDocs kind={id} mobile={mobile} />}
      {isTrack && <LiveTrack mobile={mobile} />}
      {isComingSoon && <ComingSoon mobile={mobile} name="B2B orders" blurb="Business shipments with GST invoicing and multi-box handling are not enabled by the current API contract yet." />}
      {isLiveMarketing && <LiveMarketing channel={id} mobile={mobile} />}
      {isLiveSellerSecurity && <LiveSellerSecurity mobile={mobile} />}
      {isLiveShipmentDetail && <LiveShipmentDetail mobile={mobile} />}
      {isLiveSellerWorkspace && <LiveSellerWorkspace activeId={id} mobile={mobile} />}
      {isLiveAdminOperations && <LiveAdminOperations activeId={id} mobile={mobile} />}
      {isLiveAdminReport && <LiveAdminReports activeId={id} mobile={mobile} />}
      {isLiveWorkspaceTool && <LiveWorkspaceTools activeId={id} mobile={mobile} />}
      {hasTable && !isAdminOverview && !isTrack && !isLiveSellerPage && !isLiveAdminPage && !isLiveShipmentDetail && !isLiveSellerWorkspace && !isLiveWorkspaceTool && <TablePage activeId={id} mobile={mobile} phone={phone} />}
      {hasForm && !isCreateOrder && !isComingSoon && !isLiveCreateOrder && !isLiveMarketing && !isLiveSellerSecurity && !isLiveSellerWorkspace && !isLiveWorkspaceTool && <FormPage activeId={id} mobile={mobile} phone={phone} />}
      {isAdminUtility && !isLiveAdminOperations && !isLiveWorkspaceTool && <AdminUtilityPage activeId={id} mobile={mobile} />}
      {isAccountConfig && <AccountConfiguration mobile={mobile} phone={phone} />}
    </>
  );
}
