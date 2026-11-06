'use client';

import dynamic from 'next/dynamic';
import { TABLES, FORMS, CONNECTORS } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import { MOBILE_BREAK, NARROW_BREAK, PHONE_BREAK } from '@/lib/theme';
import PageHeader from './PageHeader';
import PageContainer from './PageContainer';

// Each page loads its own code when it is opened (a route used to download every page's code).
const DashboardContent = dynamic(() => import('./DashboardContent'));
const TablePage = dynamic(() => import('./TablePage'));
const FormPage = dynamic(() => import('./FormPage'));
const AccountConfiguration = dynamic(() => import('./AccountConfiguration'));
const AdminDashboard = dynamic(() => import('./AdminDashboard'));
const AdminUtilityPage = dynamic(() => import('./AdminUtilityPage'));
const LiveSellerOperations = dynamic(() => import('./LiveSellerOperations'));
const LiveAdminQueues = dynamic(() => import('./LiveAdminQueues'));
const LiveCreateOrder = dynamic(() => import('./LiveCreateOrder'));
const LiveSellerWorkspace = dynamic(() => import('./LiveSellerWorkspace'));
const LiveAdminOperations = dynamic(() => import('./LiveAdminOperations'));
const LiveWorkspaceTools = dynamic(() => import('./LiveWorkspaceTools'));
const LiveAdminReports = dynamic(() => import('./LiveAdminReports'));
const LiveMarketing = dynamic(() => import('./LiveMarketing'));
const LiveSellerSecurity = dynamic(() => import('./LiveSellerSecurity'));
const LiveShipmentDetail = dynamic(() => import('./LiveShipmentDetail'));
const LiveBulkTrack = dynamic(() => import('./LiveBulkTrack'));
const CreateOrder = dynamic(() => import('./CreateOrder'));
const LiveNdr = dynamic(() => import('./LiveNdr'));
const LiveRto = dynamic(() => import('./LiveRto'));
const LiveAdminDisputes = dynamic(() => import('./LiveAdminDisputes'));
const LiveAdminNotes = dynamic(() => import('./LiveAdminNotes'));
const AdminSellerProfile = dynamic(() => import('./AdminSellerProfile'));
const AdminRateCards = dynamic(() => import('./AdminRateCards'));
const AdminRateAssign = dynamic(() => import('./AdminRateAssign'));
const LiveRateCard = dynamic(() => import('./LiveRateCard'));
const LiveTeamRoles = dynamic(() => import('./LiveTeamRoles'));
const LiveCodConfirmation = dynamic(() => import('./LiveCodConfirmation'));
const LiveInvoiceSettings = dynamic(() => import('./LiveInvoiceSettings'));
const LiveEmailScheduler = dynamic(() => import('./LiveEmailScheduler'));
const LiveNotifyChannels = dynamic(() => import('./LiveNotifyChannels'));
const LiveMarketplace = dynamic(() => import('./LiveMarketplace'));
const LiveKyc = dynamic(() => import('./LiveKyc'));
const LiveBillingHub = dynamic(() => import('./LiveBillingHub'));
const LiveWeightDisputes = dynamic(() => import('./LiveWeightDisputes'));
const LiveWarehouse = dynamic(() => import('./LiveWarehouse'));
const LiveRateCalculator = dynamic(() => import('./LiveRateCalculator'));
const LivePincodeServiceability = dynamic(() => import('./LivePincodeServiceability'));
const LiveTrack = dynamic(() => import('./LiveTrack'));
const LiveCourierZones = dynamic(() => import('./LiveCourierZones'));
const AdminAuditTrail = dynamic(() => import('./AdminAuditTrail'));
const LiveCourierSla = dynamic(() => import('./LiveCourierSla'));
const LiveCourierPerformance = dynamic(() => import('./LiveCourierPerformance'));
const ComingSoon = dynamic(() => import('./ComingSoon'));

export default function AppPage({ id, isDashboard = false, sellerId }) {
  const { vw } = useAppState();
  const mobile = vw <= MOBILE_BREAK;
  const phone = vw <= PHONE_BREAK;
  const narrow = vw <= NARROW_BREAK;

  // These three admin courier pages are live components; their old sample tables must not render underneath.
  const hasTable = !!TABLES[id] && !['a-zones', 'a-sla', 'a-performance'].includes(id);
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
  const isBulkTrack = id === 'bulk-track';
  const isComingSoon = id === 'b2b';
  const isLiveMarketing = ['whatsapp', 'email'].includes(id);
  const isLiveSellerSecurity = id === 'password';
  const isLiveShipmentDetail = id === 'ship-detail';
  const isLiveSellerWorkspace = ['recharges'].includes(id);
  const isTeamRoles = id === 'team';
  const isCodConfirmation = id === 'notifications';
  const isInvoiceSettings = id === 'inv-settings';
  const isEmailScheduler = id === 'email-reports';
  const isNotifyChannels = id === 'wa-api' || id === 'sms-api';
  const isCustomSetting = isTeamRoles || isCodConfirmation || isInvoiceSettings || isEmailScheduler || isNotifyChannels;
  const isAdminAudit = id === 'a-audit';
  const isLiveAdminOperations = ['a-kyc', 'a-wallets', 'a-cod', 'a-invoices', 'a-jobs', 'a-audit'].includes(id);
  const isLiveWorkspaceTool = ['courier-rules', 'label', 'mis', 'a-tickets', 'abandoned', 'profile', 'support'].includes(id);
  const isLiveAdminReport = ['a-revenue', 'a-sla-report', 'a-analytics', 'a-gst'].includes(id);
  const isAdminDisputes = id === 'a-disputes';
  const isAdminNotes = id === 'a-notes';
  const isSellerProfile = id === 'a-seller-profile';
  const isAdminRates = id === 'a-rate-cards' || id === 'a-rate-view' || id === 'a-rate-assign';
  const isCourierZones = id === 'a-zones';
  const isCourierPerformance = id === 'a-performance';
  const isCourierSla = id === 'a-sla';
  // Admin screens that have no backend yet say so instead of showing sample figures.
  const ADMIN_SOON = { 'a-escalations': 'Escalations', 'a-credit': 'Credit limits', 'a-live-chat': 'Live chat', 'a-system': 'System settings', 'a-api': 'API management', 'a-roles': 'Role permissions' };
  const isAdminSoon = id in ADMIN_SOON;
  const isAdminUtility = isAdminPage && !isAdminSoon && !isAdminOverview && !hasTable && !isCourierZones && !isCourierPerformance && !isCourierSla && !isLiveAdminReport && !isAdminDisputes && !isAdminNotes && !isSellerProfile && !isAdminRates;

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
        {isAdminSoon && <ComingSoon mobile={mobile} name={ADMIN_SOON[id]} blurb="This admin screen is not connected to live data yet, so it shows nothing rather than sample numbers." back="a-overview" backLabel="Back to dashboard" />}
        {isSellerProfile && <AdminSellerProfile sellerId={sellerId} />}
        {isCourierZones && <LiveCourierZones mobile={mobile} />}
        {isCourierPerformance && <LiveCourierPerformance mobile={mobile} />}
        {isCourierSla && <LiveCourierSla mobile={mobile} />}
        {id === 'a-rate-cards' && <AdminRateCards mobile={mobile} />}
        {(id === 'a-rate-view' || id === 'a-rate-assign') && <AdminRateAssign sellerId={sellerId} mode={id === 'a-rate-assign' ? 'assign' : 'view'} mobile={mobile} />}
        {isRateCard && <LiveRateCard mobile={mobile} />}
        {isMarketplace && <LiveMarketplace id={id} mobile={mobile} />}
        {isKyc && <LiveKyc mobile={mobile} />}
        {isTrack && <LiveTrack mobile={mobile} />}
        {isBulkTrack && <LiveBulkTrack mobile={mobile} />}
        {isComingSoon && <ComingSoon mobile={mobile} name="B2B orders" blurb="Business shipments with GST invoicing and multi-box handling are not enabled by the current API contract yet." />}
        {isLiveMarketing && <LiveMarketing channel={id} mobile={mobile} />}
        {isLiveSellerSecurity && <LiveSellerSecurity mobile={mobile} />}
        {isLiveShipmentDetail && <LiveShipmentDetail mobile={mobile} />}
        {isLiveSellerWorkspace && <LiveSellerWorkspace activeId={id} mobile={mobile} />}
        {isTeamRoles && <LiveTeamRoles mobile={mobile} />}
        {isCodConfirmation && <LiveCodConfirmation mobile={mobile} />}
        {isInvoiceSettings && <LiveInvoiceSettings mobile={mobile} />}
        {isEmailScheduler && <LiveEmailScheduler mobile={mobile} />}
        {isNotifyChannels && <LiveNotifyChannels initialTab={id === 'sms-api' ? 'sms' : 'whatsapp'} mobile={mobile} />}
        {isLiveAdminOperations && !isAdminAudit && <LiveAdminOperations activeId={id} mobile={mobile} />}
        {isAdminAudit && <AdminAuditTrail mobile={mobile} />}
        {isLiveAdminReport && <LiveAdminReports activeId={id} mobile={mobile} />}
        {isLiveWorkspaceTool && <LiveWorkspaceTools activeId={id} mobile={mobile} />}
        {hasTable && !isNew && !isNdr && !isWeight && !isAdminOverview && !isTrack && !isLiveSellerPage && !isLiveAdminPage && !isLiveShipmentDetail && !isLiveSellerWorkspace && !isLiveWorkspaceTool && !isLiveAdminOperations && !isCustomSetting && <TablePage activeId={id} mobile={mobile} phone={phone} />}
        {hasForm && !isNew && !isWeight && !isWarehouse && !isRateCalc && !isPincode && !isCreateOrder && !isComingSoon && !isLiveCreateOrder && !isLiveMarketing && !isLiveSellerSecurity && !isLiveSellerWorkspace && !isLiveWorkspaceTool && !isCustomSetting && <FormPage activeId={id} mobile={mobile} phone={phone} />}
        {isAdminUtility && !isLiveAdminPage && !isLiveAdminOperations && !isLiveWorkspaceTool && <AdminUtilityPage activeId={id} mobile={mobile} />}
        {isAccountConfig && <AccountConfiguration mobile={mobile} phone={phone} />}
      </PageContainer>
    </>
  );
}
