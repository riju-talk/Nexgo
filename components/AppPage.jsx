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
import LiveNdr from './LiveNdr';
import LiveRto from './LiveRto';
import LiveAdminDisputes from './LiveAdminDisputes';
import LiveAdminNotes from './LiveAdminNotes';
import LiveRateCard from './LiveRateCard';
import LiveMarketplace from './LiveMarketplace';
import LiveKyc from './LiveKyc';
import LiveBillingHub from './LiveBillingHub';
import LiveWeightDisputes from './LiveWeightDisputes';
import LiveWarehouse from './LiveWarehouse';
import LiveRateCalculator from './LiveRateCalculator';
import LivePincodeServiceability from './LivePincodeServiceability';
import LiveTrack from './LiveTrack';
import ComingSoon from './ComingSoon';
import PageContainer from './PageContainer';

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
  const isLiveSellerPage = ['orders'].includes(id);
  const isNdr = id === 'ndr';
  const isRto = id === 'rto';
  const isRateCard = id === 'ratecard';
  const isMarketplace = ['shopify', 'woo', 'magento', 'opencart', 'amazon'].includes(id);
  const isKyc = id === 'kyc';
  const isBillingHub = ['billing', 'cod', 'wallet', 'recharges', 'charges', 'invoice', 'credit-note', 'tds'].includes(id) && id !== 'recharges';
  const isWeight = id === 'weight';
  const isWarehouse = id === 'warehouse';
  const isRateCalc = id === 'ratecalc';
  const isPincode = id === 'pincode';
  const isLiveAdminPage = ['a-sellers', 'a-orders', 'a-shipments', 'a-ndr', 'a-rto', 'a-pickups', 'a-couriers'].includes(id);
  const isCreateOrder = id === 'b2c' || id === 'bulk-orders';
  const isLiveCreateOrder = ['dropship', 'shipnow', 'reverse'].includes(id);
  const isNew = id === 'rto' || id === 'ratecard' || id === 'kyc' || ['shopify', 'woo', 'magento', 'opencart', 'amazon'].includes(id) || ['billing', 'cod', 'wallet', 'charges', 'invoice', 'credit-note', 'tds'].includes(id);
  const isTrack = id === 'shipments';
  const isComingSoon = id === 'b2b';
  const isLiveMarketing = ['whatsapp', 'email'].includes(id);
  const isLiveSellerSecurity = id === 'password';
  const isLiveShipmentDetail = id === 'ship-detail';
  const isLiveSellerWorkspace = ['recharges', 'team'].includes(id);
  const isLiveAdminOperations = ['a-kyc', 'a-wallets', 'a-cod', 'a-invoices', 'a-jobs', 'a-audit'].includes(id);
  const isLiveWorkspaceTool = ['courier-rules', 'label', 'inv-settings', 'notifications', 'mis', 'a-tickets', 'wa-api', 'sms-api', 'abandoned', 'email-reports', 'profile', 'support'].includes(id);
  const isLiveAdminReport = ['a-revenue', 'a-sla-report', 'a-analytics', 'a-gst'].includes(id);
  const isAdminDisputes = id === 'a-disputes';
  const isAdminNotes = id === 'a-notes';
  const isAdminUtility = isAdminPage && !isAdminOverview && !hasTable && !isLiveAdminReport && !isAdminDisputes && !isAdminNotes;

  return (
    <>
      {!isAccountConfig && !isAdminOverview && !isAdminPage && <PageHeader activeId={id} isDashboard={isDashboard} mobile={mobile} phone={phone} />}
      <PageContainer admin={isAdminPage}>
      {isAdminOverview && <AdminDashboard mobile={mobile} phone={phone} />}
      {isDashboard && !isAdminOverview && <DashboardContent mobile={mobile} narrow={narrow} phone={phone} />}
        {isNdr && <LiveNdr mobile={mobile} />}
        {isWeight && <LiveWeightDisputes mobile={mobile} />}
        {isWarehouse && <LiveWarehouse mobile={mobile} />}
        {isRateCalc && <LiveRateCalculator mobile={mobile} />}
        {isPincode && <LivePincodeServiceability mobile={mobile} />}
        {isLiveSellerPage && <LiveSellerOperations activeId={id} mobile={mobile} />}
        {isLiveAdminPage && <LiveAdminQueues activeId={id} mobile={mobile} />}
        {isCreateOrder && <CreateOrder tab={id === 'bulk-orders' ? 'bulk' : 'single'} mobile={mobile} />}
        {isLiveCreateOrder && <LiveCreateOrder mobile={mobile} flow={id === 'shipnow' ? 'ship_now' : id} />}
        {isBillingHub && <LiveBillingHub activeId={id} mobile={mobile} />}
        {isRto && <LiveRto mobile={mobile} />}
        {isAdminDisputes && <LiveAdminDisputes mobile={mobile} />}
        {isAdminNotes && <LiveAdminNotes mobile={mobile} />}
        {isRateCard && <LiveRateCard mobile={mobile} />}
        {isMarketplace && <LiveMarketplace id={id} mobile={mobile} />}
        {isKyc && <LiveKyc mobile={mobile} />}
        {isTrack && <LiveTrack mobile={mobile} />}
        {isComingSoon && <ComingSoon mobile={mobile} name="B2B orders" blurb="Business shipments with GST invoicing and multi-box handling are not enabled by the current API contract yet." />}
        {isLiveMarketing && <LiveMarketing channel={id} mobile={mobile} />}
        {isLiveSellerSecurity && <LiveSellerSecurity mobile={mobile} />}
        {isLiveShipmentDetail && <LiveShipmentDetail mobile={mobile} />}
        {isLiveSellerWorkspace && <LiveSellerWorkspace activeId={id} mobile={mobile} />}
        {isLiveAdminOperations && <LiveAdminOperations activeId={id} mobile={mobile} />}
        {isLiveAdminReport && <LiveAdminReports activeId={id} mobile={mobile} />}
        {isLiveWorkspaceTool && <LiveWorkspaceTools activeId={id} mobile={mobile} />}
        {hasTable && !isNew && !isNdr && !isWeight && !isAdminOverview && !isTrack && !isLiveSellerPage && !isLiveAdminPage && !isLiveShipmentDetail && !isLiveSellerWorkspace && !isLiveWorkspaceTool && <TablePage activeId={id} mobile={mobile} phone={phone} />}
        {hasForm && !isNew && !isWeight && !isWarehouse && !isRateCalc && !isPincode && !isCreateOrder && !isComingSoon && !isLiveCreateOrder && !isLiveMarketing && !isLiveSellerSecurity && !isLiveSellerWorkspace && !isLiveWorkspaceTool && <FormPage activeId={id} mobile={mobile} phone={phone} />}
        {isAdminUtility && !isLiveAdminOperations && !isLiveWorkspaceTool && <AdminUtilityPage activeId={id} mobile={mobile} />}
        {isAccountConfig && <AccountConfiguration mobile={mobile} phone={phone} />}
      </PageContainer>
    </>
  );
}
