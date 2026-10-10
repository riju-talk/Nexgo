// Data model ported verbatim from `project/NEXGO Prototype.dc.html`'s <script data-dc-script>.
// This is a static, no-backend mock dataset — matches the design prototype's own scope
// ("static design mockups for now, real functionality comes in a later build phase").
import { GREEN, AMBER, RED, MUTE, NAVY } from './theme';

export const METRICS = [
  ['order_volume', 'Order volume', 'Card', 'Volume & fulfilment', '12,480', '+8.2%', 'up', 'vs. 11,534 prior'],
  ['in_transit', 'In transit', 'Card', 'Volume & fulfilment', '1,842', '+3.1%', 'flat', '486 out for delivery'],
  ['delivery_rate', 'Delivery rate', 'Card', 'Volume & fulfilment', '94.6%', '+1.1pp', 'up', 'Target 95%'],
  ['avg_delivery', 'Avg. delivery', 'Card', 'Volume & fulfilment', '2.4d', '-0.3d', 'up', 'Metro 1.8d'],
  ['pickup_compliance', 'Pickup compliance', 'Card', 'Volume & fulfilment', '97.1%', '-0.6pp', 'down', '32 missed'],
  ['rto_rate', 'RTO rate', 'Card', 'Exceptions & risk', '3.8%', '-0.4pp', 'up', '474 returned'],
  ['ndr_rate', 'NDR rate', 'Card', 'Exceptions & risk', '5.2%', '+0.6pp', 'down', '112 unactioned'],
  ['weight_disc', 'Weight disputes', 'Card', 'Exceptions & risk', '46', '+11', 'down', '₹8,240 held'],
  ['revenue', 'Shipping spend', 'Card', 'Money', '₹18.4L', '+6.0%', 'flat', '₹147 avg'],
  ['courier_perf', 'Courier-wise performance', 'Chart', 'Charts', '5 partners', '', 'up', ''],
  ['cod_split', 'COD vs. prepaid split', 'Chart', 'Charts', '62 / 38', '', 'up', ''],
];
// The default executive view is intentionally limited to five decisions-first
// KPIs. Additional metrics remain available through the KPI selector.
export const DEFAULTS = ['order_volume', 'delivery_rate', 'ndr_rate', 'rto_rate', 'revenue', 'courier_perf', 'cod_split'];

// [id, label, count, sub, dest(id), [[childLabel, childId], ...]]
export const SPINE = [
  ['intake', 'Intake', '1,204', 'Synced from 4 channels', 'orders', [['Orders', 'orders'], ['B2C Order', 'b2c'], ['Reverse Order', 'reverse'], ['Dropshipping Orders', 'dropship']]],
  ['book', 'Booking', '842', 'Rate compare and label', 'shipnow', [['Ship Now', 'shipnow'], ['Rate Calculator', 'ratecalc'], ['Rate Card', 'ratecard'], ['Pincode Serviceability', 'pincode']]],
  ['flight', 'In flight', '2,328', 'Pickup, transit, delivery', 'shipments', [['Shipments', 'shipments'], ['Shipment detail', 'ship-detail']]],
  ['exceptions', 'Exceptions', '158', 'NDR, RTO, weight disputes', 'ndr', [['NDR', 'ndr'], ['Weight Discrepancies', 'weight']]],
  ['money', 'Money', '₹1.2L', 'COD, charges, invoices', 'cod', [['COD Reconciliation', 'cod'], ['Shipping Charges', 'charges'], ['All Recharges', 'recharges'], ['Wallet History', 'wallet'], ['Invoice', 'invoice']]],
];

export const SECONDARY = [
  ['Reports & MIS', [['MIS reports', 'mis'], ['NDR report', 'ndr'], ['Weight discrepancies', 'weight']]],
  ['Marketing', [['Dropshipping orders', 'dropship'], ['WhatsApp marketing', 'whatsapp'], ['Email marketing', 'email']]],
  ['Tools', [['Rate card', 'ratecard'], ['Rate calculator', 'ratecalc'], ['Pincode serviceability', 'pincode']]],
  ['Channels & integrations', [['Amazon.in', 'amazon'], ['Shopify', 'shopify'], ['WooCommerce', 'woo'], ['OpenCart', 'opencart'], ['Magento', 'magento'], ['WhatsApp API', 'wa-api'], ['SMS API', 'sms-api']]],
  ['Settings', [['Warehouse settings', 'warehouse'], ['KYC', 'kyc'], ['Courier rules', 'courier-rules'], ['Label settings', 'label'], ['Invoice settings', 'inv-settings'], ['Webhook settings', 'webhook'], ['Notifications', 'notifications'], ['Profile', 'profile'], ['Change password', 'password']]],
  ['Admin panel', [['Platform Overview', 'a-overview'], ['Sellers', 'a-sellers'], ['Shipments', 'a-shipments'], ['Couriers', 'a-couriers'], ['NDR', 'a-ndr'], ['COD', 'a-cod'], ['Jobs', 'a-jobs']]],
];

// id -> [crumb, title, sub?]
export const PAGES = {
  dashboard: ['Exceptions', 'Dashboard'],
  orders: ['Orders Management', 'All orders', 'Every order across your channels and manual entries'],
  'bulk-orders': ['Orders', 'Create B2C order', 'Create one order manually, or upload many from Excel'],
  b2c: ['Orders', 'Create B2C order', 'Create one order manually, or upload many from Excel'],
  billing: ['Billing', 'Billing', 'Wallet, COD remittance, recharges, shipping charges and invoices in one place'],
  b2b: ['Orders', 'B2B orders', 'Bulk and business-to-business shipments arrive in phase 2'],
  reverse: ['Orders', 'Reverse order', 'Return pickups arrive in phase 2'],
  dropship: ['Marketing', 'Dropshipping Orders', 'Orders routed to you by partner storefronts'],
  shipnow: ['Booking', 'Ship Now', 'Book a shipment for order #KL-24817 in four steps'],
  ratecalc: ['Booking', 'Rate Calculator', 'Estimate freight before you book'],
  ratecard: ['Booking', 'Rate Card', 'Your negotiated slabs by courier and zone'],
  pincode: ['Booking', 'Pincode Serviceability', 'Check courier coverage for any pincode'],
  shipments: ['Track', 'Track shipments', 'Every booked shipment with its live courier scans'],
  'ship-detail': ['In flight', 'Shipment detail', 'AWB 2839471056283 · Order #KL-24817'],
  ndr: ['Reports', 'NDR Management', 'Non-delivery reports and the action each one needs'],
  rto: ['Reports', 'RTO Dashboard', 'Parcels returning to origin: reasons, courier performance and cost'],
  weight: ['Reports', 'Weight Management', 'Shipments billed above the weight you declared'],
  mis: ['Reports', 'MIS Report', 'Live operational totals from your workspace'],
  cod: ['Billing', 'COD Remittance', 'Collected, remitted and pending COD by payout cycle'],
  charges: ['Billing', 'Shipping Charges', 'Freight, COD and weight charges per shipment'],
  recharges: ['Billing', 'Wallet Recharges', 'Every wallet top-up and its payment reference'],
  wallet: ['Billing', 'Wallet Transactions', 'Every credit and debit with the closing balance after each one'],
  invoice: ['Billing', 'Invoice', 'Monthly GST invoices issued to your account'],
  'credit-note': ['Billing', 'Credit Notes', 'Adjustments issued against your invoices'],
  tds: ['Billing', 'TDS', 'Tax deducted at source, by financial year and quarter'],
  whatsapp: ['Marketing', 'WhatsApp Marketing', 'Broadcast campaigns on your approved templates'],
  email: ['Marketing', 'Email Marketing', 'Post-purchase and win-back email campaigns'],
  amazon: ['Channels', 'Amazon.in', 'Marketplace order sync'],
  shopify: ['Channels', 'Shopify', 'Storefront order sync'],
  woo: ['Channels', 'WooCommerce', 'Storefront order sync'],
  opencart: ['Channels', 'OpenCart', 'Storefront order sync'],
  magento: ['Channels', 'Magento', 'Storefront order sync'],
  'wa-api': ['ABC configuration', 'WhatsApp notifications', 'Transactional shipment notifications'],
  'sms-api': ['ABC configuration', 'SMS notifications', 'Transactional shipment notifications'],
  abandoned: ['ABC configuration', 'Abandoned checkout notifications', 'Win back shoppers who left before paying'],
  'account-config': ['Control Tower', 'Account Configuration', 'Manage your shipping workspace from one central place'],
  warehouse: ['Settings', 'Warehouse Settings', 'Pickup locations, cutoffs and contacts'],
  kyc: ['Settings', 'KYC', 'Business verification and document status'],
  'courier-rules': ['Settings', 'Courier Rules', 'Automatic courier allocation logic'],
  label: ['Settings', 'Label Settings', 'Label size, content and branding'],
  'inv-settings': ['Settings', 'Invoice Settings', 'Tax invoice numbering and defaults'],
  webhook: ['Settings', 'Webhook Settings', 'Event subscriptions and delivery log'],
  notifications: ['ABC configuration', 'Order confirmation', 'Confirm orders with customers before dispatch'],
  team: ['Control Tower', 'Team & roles', 'Who can work in this workspace'],
  support: ['Control Tower', 'Support & Tickets', 'Raise and track support requests'],
  'email-reports': ['Control Tower', 'Schedule email reports', 'Automated reports sent to your team'],
  profile: ['Settings', 'Profile settings', 'Your account and business details'],
  password: ['Settings', 'Change Password', 'Update your sign-in credentials'],
  'a-overview': ['Admin', 'Platform Overview', 'Every seller, courier and shipment across NEXGO'],
  'a-sellers': ['Admin', 'Sellers', '1,284 registered sellers · 962 shipping this month'],
  'a-orders': ['Admin', 'Orders', 'Platform-wide order intake across every seller and booking flow'],
  'a-shipments': ['Admin', 'Shipments', 'All shipments across every seller account'],
  'a-couriers': ['Admin', 'Couriers', 'Partner health, SLA and rate configuration'],
  'a-zones': ['Admin', 'Zone Mapping', 'Courier coverage and lane-level delivery promises'],
  'a-sla': ['Admin', 'SLA Settings', 'Set platform guardrails for pickup and delivery performance'],
  'a-performance': ['Admin', 'Courier Performance', 'Compare partner outcomes across the active network'],
  'a-kyc': ['Admin', 'KYC Verification', 'Review seller verification and compliance documents'],
  'a-wallets': ['Admin', 'Wallets', 'Monitor balances, holds and recharge activity across sellers'],
  'a-credit': ['Admin', 'Credit Limits', 'Set and review platform credit exposure'],
  'a-rto': ['Admin', 'RTO Centre', 'Track return-to-origin exposure across the network'],
  'a-pickups': ['Admin', 'Pickups', 'Monitor pickup capacity, delays and partner handoffs'],
  'a-invoices': ['Admin', 'Invoices', 'Platform invoices and seller billing records'],
  'a-gst': ['Admin', 'GST Reports', 'Tax reports, filings and invoice-level reconciliation'],
  'a-revenue': ['Admin', 'Revenue', 'Platform revenue and unit economics'],
  'a-sla-report': ['Admin', 'SLA Report', 'Network service-level performance by partner and lane'],
  'a-analytics': ['Admin', 'Courier Analytics', 'Compare courier outcomes, cost and reliability'],
  'a-tickets': ['Admin', 'Tickets', 'Platform support workload and resolution health'],
  'a-live-chat': ['Admin', 'Live Chat', 'Seller conversations requiring platform support'],
  'a-escalations': ['Admin', 'Escalations', 'Time-sensitive operational issues and ownership'],
  'a-disputes': ['Admin', 'Weight Disputes', 'Review seller weight disputes and record the courier decision'],
  'a-notes': ['Admin', 'Credit Notes & TDS', 'Issue credit notes and record TDS entries that sellers see in Billing'],
  'a-system': ['Admin', 'System Settings', 'Platform-wide operating controls'],
  'a-api': ['Admin', 'API Management', 'Integration health, webhooks and access controls'],
  'a-audit': ['Admin', 'Audit Logs', 'Immutable record of administrative activity'],
  'a-roles': ['Admin', 'Role Permissions', 'Control platform access and approvals'],
  'a-ndr': ['Admin', 'NDR', 'Platform-wide non-delivery exposure'],
  'a-cod': ['Admin', 'COD', 'Collection and remittance across all sellers'],
  'a-jobs': ['Admin', 'Jobs', 'Sync, manifest and reconciliation job runs'],
};

export const PIPELINE = [
  ['New', 1204, '#2A4570'], ['Ready to ship', 842, '#3C6094'], ['Pickup scheduled', 610, '#5A82B8'],
  ['In transit', 1842, '#1b9fd6'], ['Out for delivery', 486, '#37C7B9'], ['Delivered', 6512, '#14724F'],
  ['NDR', 358, '#8A5A00'], ['RTO', 474, '#B23A2B'], ['Cancelled', 152, '#A8A395'],
];

export const QUEUE = [
  ['112', 'NDR shipments awaiting action', 'Auto-reattempt stops in 24 hours · 38 are second attempts', 'ndr', '24H LEFT', 'E', 'Action', 'Resolve 54 NDRs', 'Bulk reattempt',
    [['Customer unavailable', '54'], ['Address incomplete', '31'], ['Refused delivery', '18'], ['Payment not ready', '9']],
    'Reattempt the 54 “customer unavailable” shipments with a fresh delivery slot, and push an address-confirmation WhatsApp to the 31 incomplete ones before the 24-hour window closes.'],
  ['46', 'Weight discrepancies raised by couriers', '₹8,240 held against wallet · dispute window closes 10 Sep', 'weight', '7D LEFT', 'W', 'Review', 'Dispute 29 cases', 'Accept all',
    [['Delhivery', '21 · ₹3,940'], ['Ekart', '14 · ₹2,610'], ['XpressBees', '11 · ₹1,690']],
    'Twenty-nine cases have packing photos on file that contradict the courier’s measurement. Dispute those in bulk; accepting the remaining seventeen costs ₹2,180.'],
  ['32', 'Pickups missed yesterday', 'Bommasandra warehouse · Delhivery and Ekart', 'pickup', 'TODAY', 'P', 'Reschedule', 'Reschedule pickup', 'Change courier',
    [['Delhivery', '19 shipments'], ['Ekart', '13 shipments'], ['Cutoff missed by', '42 min']],
    'Both riders arrived after the 4:30 PM warehouse cutoff. Rebook for the 2–6 PM slot today, or reassign the 13 Ekart shipments to Blue Dart at ₹41 more per shipment.'],
  ['₹1.2L', 'COD remittance in the next payout', 'Expected 06 Sep · HDFC ••4412', 'cod', '06 SEP', 'R', 'View', 'Download statement', 'Change payout account',
    [['Delivered COD value', '₹1,34,820'], ['Platform charges', '−₹9,640'], ['Weight disputes held', '−₹8,240']],
    'The 06 September cycle nets ₹1,16,940 after charges. Resolving the weight disputes before 05 September releases the held ₹8,240 into this same payout.'],
];

export const TREND_A = [58, 62, 55, 71, 68, 74, 80, 76, 84, 79, 88, 92, 86, 95, 90, 98, 94, 102, 108, 99, 112, 106, 118, 114, 122, 116, 128, 124, 132, 136];
export const TREND_B = [50, 54, 49, 63, 61, 66, 72, 69, 76, 72, 80, 84, 79, 87, 83, 90, 87, 94, 99, 92, 103, 98, 108, 105, 112, 107, 118, 114, 121, 124];

export const COURIER_PERF = [
  { name: 'Blue Dart', rate: '97.8%', w: '97.8%', vol: '624', color: GREEN },
  { name: 'Delhivery', rate: '96.2%', w: '96.2%', vol: '1,482', color: GREEN },
  { name: 'Ekart', rate: '93.1%', w: '93.1%', vol: '918', color: 'accent' },
  { name: 'XpressBees', rate: '91.4%', w: '91.4%', vol: '546', color: 'accent' },
  { name: 'Ecom Express', rate: '88.0%', w: '88%', vol: '348', color: AMBER },
];

export const ST = {
  New: ['#1A5AA8', '#EAF1FA', '#C6D8EE'], 'Ready to ship': ['#14527f', '#e3f1fa', '#bfe3ee'],
  'Pickup scheduled': ['#5C5849', '#F2F0EA', '#DCD7C9'], 'Pickup pending': ['#5C5849', '#F2F0EA', '#DCD7C9'],
  'In transit': ['#1A5AA8', '#EAF1FA', '#C6D8EE'], 'Out for delivery': ['#14527f', '#e3f1fa', '#bfe3ee'],
  Delivered: ['#14724F', '#E7F4EC', '#BDDCC9'], NDR: ['#8A5A00', '#FDF6E6', '#E5D3A8'],
  'RTO in transit': ['#B23A2B', '#FBEDEA', '#E8C4BD'], RTO: ['#B23A2B', '#FBEDEA', '#E8C4BD'],
  Cancelled: ['#8C8778', '#F5F3EF', '#E3DED3'], Open: ['#8A5A00', '#FDF6E6', '#E5D3A8'],
  Disputed: ['#1A5AA8', '#EAF1FA', '#C6D8EE'], Accepted: ['#8C8778', '#F5F3EF', '#E3DED3'],
  Won: ['#14724F', '#E7F4EC', '#BDDCC9'], Remitted: ['#14724F', '#E7F4EC', '#BDDCC9'],
  Pending: ['#8A5A00', '#FDF6E6', '#E5D3A8'], Processing: ['#1A5AA8', '#EAF1FA', '#C6D8EE'],
  Success: ['#14724F', '#E7F4EC', '#BDDCC9'], Failed: ['#B23A2B', '#FBEDEA', '#E8C4BD'],
  Active: ['#14724F', '#E7F4EC', '#BDDCC9'], Suspended: ['#B23A2B', '#FBEDEA', '#E8C4BD'],
  Onboarding: ['#1A5AA8', '#EAF1FA', '#C6D8EE'], Degraded: ['#8A5A00', '#FDF6E6', '#E5D3A8'],
  Healthy: ['#14724F', '#E7F4EC', '#BDDCC9'], Queued: ['#5C5849', '#F2F0EA', '#DCD7C9'],
  Running: ['#1A5AA8', '#EAF1FA', '#C6D8EE'], Verified: ['#14724F', '#E7F4EC', '#BDDCC9'],
  COD: ['#6B5416', '#FDF6E6', '#E5D3A8'], Prepaid: ['#14527f', '#e3f1fa', '#bfe3ee'],
  Actioned: ['#14724F', '#E7F4EC', '#BDDCC9'], Unactioned: ['#B23A2B', '#FBEDEA', '#E8C4BD'],
};

export const TABLES = {
  orders: {
    search: 'Search order ID, customer, phone', min: '1120px', count: 'Showing 1–7 of 1,204 orders',
    tabs: [['All', '1,204'], ['New', '412'], ['Ready to ship', '338'], ['Pickup scheduled', '302'], ['Cancelled', '152']],
    filters: ['All channels', 'Payment mode', 'Last 30 days'], tools: ['Export CSV', 'Bulk import', '+ Create order'],
    stats: [['Unshipped', '1,204', '+62', 'down', 'oldest is 3 days old'], ['Ready to ship', '842', '+118', 'up', 'labels generated'], ['COD share', '62%', '+2pp', 'flat', '7,738 of 12,480'], ['Avg order value', '₹1,842', '+₹94', 'up', 'across 4 channels']],
    cols: [['Order', 'left'], ['Order date', 'left'], ['Customer', 'left'], ['Products', 'left'], ['Payment', 'left'], ['Order value', 'right'], ['Channel', 'left'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['m', 'KL-24817', 'AMZ-402-9917238'], ['t', '03 Sep, 11:42'], ['t', 'Rohit Menon', 'Bengaluru, KA'], ['t', 'Linen Cushion Cover Set', '4 items'], ['s', 'COD'], ['n', '₹2,480'], ['t', 'Amazon.in'], ['s', 'New'], ['l', 'Ship now']],
      [['m', 'KL-24816', 'SHP-#10238'], ['t', '03 Sep, 10:18'], ['t', 'Sneha Kulkarni', 'Pune, MH'], ['t', 'Handwoven Cotton Throw', '1 item'], ['s', 'Prepaid'], ['n', '₹1,899'], ['t', 'Shopify'], ['s', 'New'], ['l', 'Ship now']],
      [['m', 'KL-24815', 'SHP-#10237'], ['t', '03 Sep, 09:55'], ['t', 'Arjun Iyer', 'Chennai, TN'], ['t', 'Terracotta Planter Trio', '3 items'], ['s', 'COD'], ['n', '₹1,240'], ['t', 'Shopify'], ['s', 'Ready to ship'], ['l', 'Ship now']],
      [['m', 'KL-24814', 'WOO-8814'], ['t', '02 Sep, 19:07'], ['t', 'Divya Sharma', 'Jaipur, RJ'], ['t', 'Block Print Bedsheet', '1 item'], ['s', 'Prepaid'], ['n', '₹3,150'], ['t', 'WooCommerce'], ['s', 'Ready to ship'], ['l', 'Ship now']],
      [['m', 'KL-24813', 'AMZ-402-9917101'], ['t', '02 Sep, 17:31'], ['t', 'Faizan Ahmed', 'Hyderabad, TS'], ['t', 'Brass Diya Set', '6 items'], ['s', 'COD'], ['n', '₹960'], ['t', 'Amazon.in'], ['s', 'Pickup scheduled'], ['l', 'Track']],
      [['m', 'KL-24812', 'MAN-1042'], ['t', '02 Sep, 15:12'], ['t', 'Priya Nair', 'Kochi, KL'], ['t', 'Jute Table Runner', '2 items'], ['s', 'Prepaid'], ['n', '₹740'], ['t', 'Manual'], ['s', 'Pickup scheduled'], ['l', 'Track']],
      [['m', 'KL-24811', 'SHP-#10231'], ['t', '02 Sep, 12:44'], ['t', 'Karan Bhatia', 'New Delhi, DL'], ['t', 'Ceramic Dinner Plate Set', '1 item'], ['s', 'COD'], ['n', '₹4,320'], ['t', 'Shopify'], ['s', 'Cancelled'], ['l', 'View']],
    ],
  },
  dropship: {
    search: 'Search partner order or SKU', min: '1020px', count: 'Showing 1–5 of 214 dropship orders',
    tabs: [['All', '214'], ['Awaiting stock', '38'], ['Shipped', '164'], ['Rejected', '12']],
    filters: ['All partners', 'Last 30 days'], tools: ['Export CSV'],
    stats: [['Partner orders', '214', '+31', 'up', 'from 6 storefronts'], ['Fulfilled', '164', '+24', 'up', '76.6% of total'], ['Margin', '₹1.4L', '+9.2%', 'up', 'after freight'], ['Rejected', '12', '+4', 'down', 'stock unavailable']],
    cols: [['Partner order', 'left'], ['Partner', 'left'], ['Customer', 'left'], ['SKU', 'left'], ['Payout', 'right'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['m', 'DS-88421'], ['t', 'Nestasia'], ['t', 'Aditi Ghosh', 'Kolkata, WB'], ['m', 'KL-CUSH-004'], ['n', '₹1,180'], ['s', 'Ready to ship'], ['l', 'Ship now']],
      [['m', 'DS-88418'], ['t', 'Pepperfry'], ['t', 'Nikhil Rao', 'Mumbai, MH'], ['m', 'KL-THRW-011'], ['n', '₹2,240'], ['s', 'Delivered'], ['l', 'View']],
      [['m', 'DS-88410'], ['t', 'Nestasia'], ['t', 'Sonal Mehta', 'Surat, GJ'], ['m', 'KL-PLNT-003'], ['n', '₹860'], ['s', 'New'], ['l', 'Ship now']],
      [['m', 'DS-88402'], ['t', 'Tata CLiQ'], ['t', 'Imran Shaikh', 'Nagpur, MH'], ['m', 'KL-BSHT-002'], ['n', '₹2,980'], ['s', 'In transit'], ['l', 'Track']],
      [['m', 'DS-88391'], ['t', 'Pepperfry'], ['t', 'Lakshmi Reddy', 'Vijayawada, AP'], ['m', 'KL-DIYA-006'], ['n', '₹640'], ['s', 'Cancelled'], ['l', 'View']],
    ],
  },
  shipments: {
    search: 'Search AWB or order ID', min: '1180px', count: 'Showing 1–7 of 3,918 shipments',
    tabs: [['All', '3,918'], ['Pickup pending', '284'], ['In transit', '1,842'], ['Out for delivery', '486'], ['NDR', '358'], ['RTO', '474']],
    filters: ['All couriers', 'All warehouses', 'Last 30 days'], tools: ['Download manifest', 'Export CSV'],
    stats: [['In transit', '1,842', '+3.1%', 'flat', '486 out for delivery'], ['Delivered', '6,512', '+8.4%', 'up', '94.6% delivery rate'], ['Exceptions', '832', '+46', 'down', 'NDR and RTO combined'], ['Freight billed', '₹18.4L', '+6.0%', 'flat', '₹147 avg per shipment']],
    cols: [['AWB / order', 'left'], ['Courier', 'left'], ['Route', 'left'], ['Weight', 'right'], ['Mode', 'left'], ['Charge', 'right'], ['Status', 'left'], ['Promised', 'left'], ['', 'right']],
    rows: [
      [['l', '2839471056283', 'KL-24817'], ['t', 'Delhivery', 'Surface 2kg'], ['t', 'Bengaluru → Bengaluru', '560068 → 560102'], ['n', '2.25 kg'], ['s', 'COD'], ['n', '₹142.50'], ['s', 'Out for delivery'], ['t', '03 Sep'], ['l', 'Track']],
      [['l', '7712004488390', 'KL-24805'], ['t', 'Blue Dart', 'Air Express'], ['t', 'Bengaluru → Pune', '560068 → 411045'], ['n', '1.10 kg'], ['s', 'Prepaid'], ['n', '₹268.00'], ['s', 'In transit'], ['t', '04 Sep'], ['l', 'Track']],
      [['l', 'EK9930412887', 'KL-24802'], ['t', 'Ekart', 'Surface 5kg'], ['t', 'Bengaluru → Chennai', '560068 → 600042'], ['n', '4.80 kg'], ['s', 'COD'], ['n', '₹212.00'], ['s', 'In transit'], ['t', '05 Sep'], ['l', 'Track']],
      [['l', 'XB4471209934', 'KL-24798'], ['t', 'XpressBees', 'Surface 1kg'], ['t', 'Bengaluru → Jaipur', '560068 → 302017'], ['n', '0.90 kg'], ['s', 'Prepaid'], ['n', '₹184.50'], ['s', 'Delivered'], ['t', '02 Sep'], ['l', 'Track']],
      [['l', 'ECOM88210044', 'KL-24791'], ['t', 'Ecom Express', 'Surface 2kg'], ['t', 'Bengaluru → Hyderabad', '560068 → 500081'], ['n', '1.60 kg'], ['s', 'COD'], ['n', '₹158.00'], ['s', 'NDR'], ['t', '04 Sep'], ['l', 'Track']],
      [['l', '7712004471109', 'KL-24780'], ['t', 'Blue Dart', 'Air Express'], ['t', 'Bengaluru → New Delhi', '560068 → 110024'], ['n', '2.00 kg'], ['s', 'COD'], ['n', '₹342.00'], ['s', 'Pickup pending'], ['t', '06 Sep'], ['l', 'Track']],
      [['l', 'EK9930409112', 'KL-24774'], ['t', 'Ekart', 'Surface 2kg'], ['t', 'Bengaluru → Ahmedabad', '560068 → 380015'], ['n', '2.10 kg'], ['s', 'Prepaid'], ['n', '₹196.00'], ['s', 'RTO in transit'], ['t', '07 Sep'], ['l', 'Track']],
    ],
  },
  ndr: {
    search: 'Search AWB, customer or phone', min: '1140px', count: 'Showing 1–6 of 358 NDR shipments',
    tabs: [['All', '358'], ['Unactioned', '112'], ['Reattempt requested', '164'], ['Converted to RTO', '82']],
    filters: ['All reasons', 'All couriers', 'Attempt count'], tools: ['Bulk reattempt', 'Export CSV'],
    stats: [['Open NDR', '358', '+22', 'down', '5.2% of shipments'], ['Unactioned', '112', '+18', 'down', 'auto-RTO in 24h'], ['Reattempt success', '68.4%', '+2.1pp', 'up', 'last 30 days'], ['COD at risk', '₹4.8L', '+₹62k', 'down', 'across 358 shipments']],
    cols: [['AWB', 'left'], ['Customer', 'left'], ['Courier', 'left'], ['Reason', 'left'], ['Attempt', 'left'], ['COD', 'right'], ['Status', 'left'], ['SLA', 'left'], ['', 'right']],
    rows: [
      [['m', 'ECOM88210044', 'KL-24791'], ['t', 'Faizan Ahmed', 'Hyderabad, TS'], ['t', 'Ecom Express'], ['t', 'Customer unavailable'], ['t', '2 of 3'], ['n', '₹960'], ['s', 'Unactioned'], ['t', '18h left'], ['l', 'Resolve']],
      [['m', 'EK9930411002', 'KL-24766'], ['t', 'Neha Verma', 'Indore, MP'], ['t', 'Ekart'], ['t', 'Address incomplete'], ['t', '1 of 3'], ['n', '₹1,540'], ['s', 'Unactioned'], ['t', '22h left'], ['l', 'Resolve']],
      [['m', 'XB4471188420', 'KL-24759'], ['t', 'Rahul Dubey', 'Patna, BR'], ['t', 'XpressBees'], ['t', 'Refused delivery'], ['t', '2 of 3'], ['n', '₹2,180'], ['s', 'Actioned'], ['t', 'Reattempt 04 Sep'], ['l', 'View']],
      [['m', '2839470881190', 'KL-24741'], ['t', 'Meenakshi S.', 'Madurai, TN'], ['t', 'Delhivery'], ['t', 'Payment not ready'], ['t', '1 of 3'], ['n', '₹3,420'], ['s', 'Actioned'], ['t', 'Reattempt 04 Sep'], ['l', 'View']],
      [['m', 'ECOM88209871', 'KL-24728'], ['t', 'Sanjay Pillai', 'Thrissur, KL'], ['t', 'Ecom Express'], ['t', 'Customer unavailable'], ['t', '3 of 3'], ['n', '₹880'], ['s', 'RTO'], ['t', 'Closed'], ['l', 'View']],
      [['m', 'EK9930407744', 'KL-24710'], ['t', 'Ritu Malhotra', 'Chandigarh, CH'], ['t', 'Ekart'], ['t', 'Address incomplete'], ['t', '2 of 3'], ['n', '₹1,260'], ['s', 'Unactioned'], ['t', '9h left'], ['l', 'Resolve']],
    ],
  },
  weight: {
    search: 'Search AWB or order ID', min: '1080px', count: 'Showing 1–6 of 46 disputes',
    tabs: [['All', '46'], ['Open', '29'], ['Disputed', '11'], ['Accepted', '6']],
    filters: ['All couriers', 'Dispute window'], tools: ['Bulk dispute', 'Export CSV'],
    stats: [['Open disputes', '46', '+11', 'down', '₹8,240 held'], ['Evidence on file', '29', '+7', 'up', 'packing photos available'], ['Won last cycle', '18', '+5', 'up', '₹4,120 released'], ['Accepted', '6', '+2', 'flat', '₹1,180 written off']],
    cols: [['AWB', 'left'], ['Courier', 'left'], ['Declared', 'right'], ['Charged', 'right'], ['Difference', 'right'], ['Amount held', 'right'], ['Raised', 'left'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['m', '2839471029844', 'KL-24788'], ['t', 'Delhivery'], ['n', '1.80 kg'], ['n', '3.50 kg'], ['n', '+1.70 kg'], ['n', '₹186'], ['t', '01 Sep'], ['s', 'Open'], ['l', 'Dispute']],
      [['m', 'EK9930404410', 'KL-24771'], ['t', 'Ekart'], ['n', '2.10 kg'], ['n', '4.00 kg'], ['n', '+1.90 kg'], ['n', '₹204'], ['t', '31 Aug'], ['s', 'Open'], ['l', 'Dispute']],
      [['m', 'XB4471176633', 'KL-24752'], ['t', 'XpressBees'], ['n', '0.90 kg'], ['n', '1.50 kg'], ['n', '+0.60 kg'], ['n', '₹78'], ['t', '30 Aug'], ['s', 'Disputed'], ['l', 'View']],
      [['m', '2839470992017', 'KL-24736'], ['t', 'Delhivery'], ['n', '4.80 kg'], ['n', '6.50 kg'], ['n', '+1.70 kg'], ['n', '₹212'], ['t', '29 Aug'], ['s', 'Disputed'], ['l', 'View']],
      [['m', 'EK9930401188', 'KL-24719'], ['t', 'Ekart'], ['n', '1.20 kg'], ['n', '1.50 kg'], ['n', '+0.30 kg'], ['n', '₹42'], ['t', '28 Aug'], ['s', 'Accepted'], ['l', 'View']],
      [['m', 'ECOM88208012', 'KL-24702'], ['t', 'Ecom Express'], ['n', '2.00 kg'], ['n', '2.50 kg'], ['n', '+0.50 kg'], ['n', '₹58'], ['t', '27 Aug'], ['s', 'Won'], ['l', 'View']],
    ],
  },
  cod: {
    search: 'Search payout reference or AWB', min: '1040px', count: 'Showing 1–6 of 84 payout cycles',
    tabs: [['All cycles', '84'], ['Pending', '3'], ['Remitted', '81']],
    filters: ['All couriers', 'Last 90 days'], tools: ['Download statement', 'Export CSV'],
    stats: [['Collected', '₹41.2L', '+7.8%', 'up', 'last 30 days'], ['Remitted', '₹38.6L', '+8.1%', 'up', '81 cycles closed'], ['Pending', '₹1.2L', '−₹18k', 'flat', 'next cycle 06 Sep'], ['Held', '₹8,240', '+₹2,180', 'down', 'weight disputes']],
    cols: [['Payout reference', 'left'], ['Cycle', 'left'], ['Shipments', 'right'], ['COD collected', 'right'], ['Charges', 'right'], ['Net remitted', 'right'], ['Bank account', 'left'], ['Status', 'left']],
    rows: [
      [['m', 'PO-2026-0418'], ['t', '30 Aug – 05 Sep'], ['n', '612'], ['n', '₹1,34,820'], ['n', '−₹17,880'], ['n', '₹1,16,940'], ['t', 'HDFC ••4412'], ['s', 'Pending']],
      [['m', 'PO-2026-0411'], ['t', '23 – 29 Aug'], ['n', '588'], ['n', '₹1,28,440'], ['n', '−₹16,210'], ['n', '₹1,12,230'], ['t', 'HDFC ••4412'], ['s', 'Remitted']],
      [['m', 'PO-2026-0404'], ['t', '16 – 22 Aug'], ['n', '640'], ['n', '₹1,41,020'], ['n', '−₹18,640'], ['n', '₹1,22,380'], ['t', 'HDFC ••4412'], ['s', 'Remitted']],
      [['m', 'PO-2026-0397'], ['t', '09 – 15 Aug'], ['n', '574'], ['n', '₹1,22,760'], ['n', '−₹15,980'], ['n', '₹1,06,780'], ['t', 'HDFC ••4412'], ['s', 'Remitted']],
      [['m', 'PO-2026-0390'], ['t', '02 – 08 Aug'], ['n', '602'], ['n', '₹1,31,540'], ['n', '−₹17,120'], ['n', '₹1,14,420'], ['t', 'HDFC ••4412'], ['s', 'Remitted']],
      [['m', 'PO-2026-0383'], ['t', '26 Jul – 01 Aug'], ['n', '556'], ['n', '₹1,18,900'], ['n', '−₹15,440'], ['n', '₹1,03,460'], ['t', 'HDFC ••4412'], ['s', 'Remitted']],
    ],
  },
  charges: {
    search: 'Search AWB or order ID', min: '1080px', count: 'Showing 1–6 of 3,918 charge lines',
    tabs: [['All', '3,918'], ['Forward', '3,444'], ['RTO', '474']],
    filters: ['All couriers', 'Charge type', 'Last 30 days'], tools: ['Export CSV'],
    stats: [['Freight', '₹15.9L', '+5.4%', 'flat', '3,918 shipments'], ['COD fees', '₹1.7L', '+7.1%', 'flat', 'on 7,738 COD orders'], ['GST', '₹2.8L', '+6.0%', 'flat', 'at 18%'], ['Avg per shipment', '₹147', '−₹4', 'up', 'blended across couriers']],
    cols: [['AWB', 'left'], ['Courier', 'left'], ['Type', 'left'], ['Billed weight', 'right'], ['Freight', 'right'], ['COD fee', 'right'], ['GST', 'right'], ['Total', 'right'], ['Date', 'left']],
    rows: [
      [['m', '2839471056283'], ['t', 'Delhivery'], ['t', 'Forward'], ['n', '2.50 kg'], ['n', '₹118.00'], ['n', '₹24.50'], ['n', '₹25.65'], ['n', '₹168.15'], ['t', '02 Sep']],
      [['m', '7712004488390'], ['t', 'Blue Dart'], ['t', 'Forward'], ['n', '1.50 kg'], ['n', '₹268.00'], ['n', '₹0.00'], ['n', '₹48.24'], ['n', '₹316.24'], ['t', '02 Sep']],
      [['m', 'EK9930412887'], ['t', 'Ekart'], ['t', 'Forward'], ['n', '5.00 kg'], ['n', '₹212.00'], ['n', '₹31.20'], ['n', '₹43.78'], ['n', '₹286.98'], ['t', '01 Sep']],
      [['m', 'EK9930409112'], ['t', 'Ekart'], ['t', 'RTO'], ['n', '2.50 kg'], ['n', '₹196.00'], ['n', '₹0.00'], ['n', '₹35.28'], ['n', '₹231.28'], ['t', '31 Aug']],
      [['m', 'XB4471209934'], ['t', 'XpressBees'], ['t', 'Forward'], ['n', '1.00 kg'], ['n', '₹184.50'], ['n', '₹0.00'], ['n', '₹33.21'], ['n', '₹217.71'], ['t', '31 Aug']],
      [['m', 'ECOM88210044'], ['t', 'Ecom Express'], ['t', 'Forward'], ['n', '2.00 kg'], ['n', '₹158.00'], ['n', '₹22.80'], ['n', '₹32.54'], ['n', '₹213.34'], ['t', '30 Aug']],
    ],
  },
  recharges: {
    search: 'Search payment reference', min: '900px', count: 'Showing 1–6 of 148 recharges',
    tabs: [['All', '148'], ['Success', '144'], ['Failed', '4']],
    filters: ['All methods', 'Last 90 days'], tools: ['Download receipts', '+ Recharge wallet'],
    stats: [['Recharged', '₹22.4L', '+11.2%', 'up', 'last 90 days'], ['Auto-recharge', 'On', '', 'flat', 'below ₹10,000'], ['Avg top-up', '₹15,135', '+₹1,240', 'up', 'across 148 recharges'], ['Failed', '4', '+1', 'down', 'payment declined']],
    cols: [['Reference', 'left'], ['Date', 'left'], ['Method', 'left'], ['Amount', 'right'], ['GST credit', 'right'], ['Closing balance', 'right'], ['Status', 'left']],
    rows: [
      [['m', 'RZP-4482910'], ['t', '01 Sep, 09:14'], ['t', 'NEFT · HDFC ••4412'], ['n', '₹50,000'], ['n', '₹0.00'], ['n', '₹62,418.50'], ['s', 'Success']],
      [['m', 'RZP-4471882'], ['t', '24 Aug, 18:40'], ['t', 'UPI · anita@hdfcbank'], ['n', '₹25,000'], ['n', '₹0.00'], ['n', '₹38,220.00'], ['s', 'Success']],
      [['m', 'RZP-4460114'], ['t', '18 Aug, 11:02'], ['t', 'Auto-recharge · card ••8821'], ['n', '₹20,000'], ['n', '₹0.00'], ['n', '₹27,640.50'], ['s', 'Success']],
      [['m', 'RZP-4458003'], ['t', '18 Aug, 10:58'], ['t', 'Auto-recharge · card ••8821'], ['n', '₹20,000'], ['n', '₹0.00'], ['n', '₹7,640.50'], ['s', 'Failed']],
      [['m', 'RZP-4441290'], ['t', '09 Aug, 15:26'], ['t', 'NEFT · HDFC ••4412'], ['n', '₹40,000'], ['n', '₹0.00'], ['n', '₹44,180.00'], ['s', 'Success']],
      [['m', 'RZP-4429817'], ['t', '02 Aug, 08:47'], ['t', 'UPI · anita@hdfcbank'], ['n', '₹15,000'], ['n', '₹0.00'], ['n', '₹21,904.00'], ['s', 'Success']],
    ],
  },
  wallet: {
    search: 'Search AWB, reference or narration', min: '980px', count: 'Showing 1–7 of 4,066 ledger entries',
    tabs: [['All', '4,066'], ['Debits', '3,918'], ['Credits', '148']],
    filters: ['Entry type', 'Last 30 days'], tools: ['Export ledger'],
    stats: [['Balance', '₹42,977.00', '', 'flat', 'as of 09:42 today'], ['Debited', '₹18.4L', '+6.0%', 'flat', 'last 30 days'], ['Credited', '₹22.4L', '+11.2%', 'up', 'recharges and refunds'], ['Held', '₹8,240', '+₹2,180', 'down', 'weight disputes']],
    cols: [['Date', 'left'], ['Narration', 'left'], ['Reference', 'left'], ['Debit', 'right'], ['Credit', 'right'], ['Balance', 'right']],
    rows: [
      [['t', '03 Sep, 09:12'], ['t', 'Freight · Delhivery Surface', 'AWB 2839471056283'], ['m', 'TXN-9928410'], ['n', '₹168.15'], ['n', 'N/A'], ['n', '₹42,977.00']],
      [['t', '03 Sep, 08:58'], ['t', 'Freight · Blue Dart Air', 'AWB 7712004488390'], ['m', 'TXN-9928402'], ['n', '₹316.24'], ['n', 'N/A'], ['n', '₹43,145.15']],
      [['t', '02 Sep, 19:34'], ['t', 'Weight discrepancy hold', 'AWB 2839471029844'], ['m', 'TXN-9927881'], ['n', '₹186.00'], ['n', 'N/A'], ['n', '₹43,461.39']],
      [['t', '02 Sep, 16:20'], ['t', 'RTO freight · Ekart', 'AWB EK9930409112'], ['m', 'TXN-9927744'], ['n', '₹231.28'], ['n', 'N/A'], ['n', '₹43,647.39']],
      [['t', '01 Sep, 09:14'], ['t', 'Wallet recharge · NEFT', 'HDFC ••4412'], ['m', 'RZP-4482910'], ['n', 'N/A'], ['n', '₹50,000.00'], ['n', '₹43,878.67']],
      [['t', '31 Aug, 22:04'], ['t', 'Dispute won · refund', 'AWB ECOM88208012'], ['m', 'TXN-9925012'], ['n', 'N/A'], ['n', '₹58.00'], ['n', '₹-6,121.33']],
      [['t', '31 Aug, 17:41'], ['t', 'Freight · XpressBees Surface', 'AWB XB4471209934'], ['m', 'TXN-9924880'], ['n', '₹217.71'], ['n', 'N/A'], ['n', '₹-6,179.33']],
    ],
  },
  'a-sellers': {
    search: 'Search seller name, ID or GSTIN', min: '1120px', count: 'Showing 1–6 of 1,284 sellers',
    tabs: [['All', '1,284'], ['Active', '962'], ['Onboarding', '218'], ['Suspended', '104']],
    filters: ['KYC status', 'Plan', 'Signup date'], tools: ['Export CSV', '+ Add seller'],
    stats: [['Registered sellers', '1,284', '+64', 'up', '962 shipping this month'], ['Platform shipments', '2.41L', '+9.4%', 'up', 'last 30 days'], ['Platform GMV', '₹18.6Cr', '+11.8%', 'up', 'last 30 days'], ['Wallet float', '₹4.82Cr', '+₹38L', 'up', 'across all sellers']],
    cols: [['Seller', 'left'], ['Seller ID', 'left'], ['Plan', 'left'], ['Shipments (30d)', 'right'], ['Wallet', 'right'], ['Delivery rate', 'right'], ['KYC', 'left'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['t', 'Karma Living', 'Bengaluru, KA'], ['m', '48291'], ['t', 'Growth'], ['n', '3,918'], ['n', '₹42,977'], ['n', '94.6%'], ['s', 'Verified'], ['s', 'Active'], ['l', 'Open']],
      [['t', 'Urban Threads', 'Mumbai, MH'], ['m', '48104'], ['t', 'Enterprise'], ['n', '12,486'], ['n', '₹2,18,440'], ['n', '96.1%'], ['s', 'Verified'], ['s', 'Active'], ['l', 'Open']],
      [['t', 'Nashik Naturals', 'Nashik, MH'], ['m', '47990'], ['t', 'Starter'], ['n', '412'], ['n', '₹6,180'], ['n', '91.2%'], ['s', 'Pending'], ['s', 'Onboarding'], ['l', 'Open']],
      [['t', 'Delhi Denim Co.', 'New Delhi, DL'], ['m', '47812'], ['t', 'Growth'], ['n', '2,046'], ['n', '₹18,220'], ['n', '89.4%'], ['s', 'Verified'], ['s', 'Active'], ['l', 'Open']],
      [['t', 'Kochi Spice House', 'Kochi, KL'], ['m', '47640'], ['t', 'Growth'], ['n', '1,188'], ['n', '₹-4,180'], ['n', '92.8%'], ['s', 'Verified'], ['s', 'Suspended'], ['l', 'Open']],
      [['t', 'Jaipur Blockworks', 'Jaipur, RJ'], ['m', '47501'], ['t', 'Starter'], ['n', '624'], ['n', '₹9,440'], ['n', '93.6%'], ['s', 'Verified'], ['s', 'Active'], ['l', 'Open']],
    ],
  },
  'a-shipments': {
    search: 'Search AWB, seller or order ID', min: '1140px', count: 'Showing 1–6 of 2,41,088 shipments',
    tabs: [['All', '2.41L'], ['In transit', '84.2k'], ['Exceptions', '18.6k'], ['Delivered', '1.38L']],
    filters: ['All sellers', 'All couriers', 'Last 30 days'], tools: ['Export CSV'],
    stats: [['Shipments (30d)', '2.41L', '+9.4%', 'up', 'across 962 sellers'], ['Delivery rate', '93.8%', '+0.6pp', 'up', 'platform blended'], ['Exceptions', '18.6k', '+1.2k', 'down', '7.7% of volume'], ['Avg delivery', '2.7d', '−0.2d', 'up', 'metro 1.9d']],
    cols: [['AWB', 'left'], ['Seller', 'left'], ['Courier', 'left'], ['Route', 'left'], ['Weight', 'right'], ['Charge', 'right'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['m', '2839471056283'], ['t', 'Karma Living', '48291'], ['t', 'Delhivery'], ['t', 'BLR → BLR'], ['n', '2.25 kg'], ['n', '₹142.50'], ['s', 'Out for delivery'], ['l', 'Open']],
      [['m', '9920144871220'], ['t', 'Urban Threads', '48104'], ['t', 'Blue Dart'], ['t', 'BOM → DEL'], ['n', '0.80 kg'], ['n', '₹294.00'], ['s', 'In transit'], ['l', 'Open']],
      [['m', 'EK9930412887'], ['t', 'Karma Living', '48291'], ['t', 'Ekart'], ['t', 'BLR → MAA'], ['n', '4.80 kg'], ['n', '₹212.00'], ['s', 'In transit'], ['l', 'Open']],
      [['m', 'XB8814402991'], ['t', 'Delhi Denim Co.', '47812'], ['t', 'XpressBees'], ['t', 'DEL → LKO'], ['n', '1.20 kg'], ['n', '₹168.00'], ['s', 'NDR'], ['l', 'Open']],
      [['m', 'ECOM77120388'], ['t', 'Kochi Spice House', '47640'], ['t', 'Ecom Express'], ['t', 'COK → HYD'], ['n', '3.40 kg'], ['n', '₹238.00'], ['s', 'RTO in transit'], ['l', 'Open']],
      [['m', '2839470118844'], ['t', 'Jaipur Blockworks', '47501'], ['t', 'Delhivery'], ['t', 'JAI → PNQ'], ['n', '1.90 kg'], ['n', '₹176.50'], ['s', 'Delivered'], ['l', 'Open']],
    ],
  },
  'a-couriers': {
    search: 'Search courier partner', min: '1060px', count: '8 courier partners configured',
    tabs: [['All', '8'], ['Healthy', '5'], ['Degraded', '2'], ['Suspended', '1']],
    filters: ['Service type', 'Zone coverage'], tools: ['Sync rate cards', '+ Add courier'],
    stats: [['Partners live', '8', '+1', 'up', '5 healthy'], ['Blended SLA', '93.8%', '+0.6pp', 'up', 'platform-wide'], ['API uptime', '99.4%', '−0.3pp', 'down', 'last 30 days'], ['Pickup compliance', '96.2%', '+1.1pp', 'up', 'across all hubs']],
    cols: [['Courier', 'left'], ['Services', 'left'], ['Pincodes', 'right'], ['Volume (30d)', 'right'], ['Delivery rate', 'right'], ['NDR rate', 'right'], ['API uptime', 'right'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['t', 'Delhivery', 'Surface, Air'], ['t', 'Forward, RTO, Reverse'], ['n', '19,842'], ['n', '92,410'], ['n', '96.2%'], ['n', '4.1%'], ['n', '99.8%'], ['s', 'Healthy'], ['l', 'Configure']],
      [['t', 'Blue Dart', 'Air Express'], ['t', 'Forward, RTO'], ['n', '13,204'], ['n', '38,660'], ['n', '97.8%'], ['n', '2.8%'], ['n', '99.9%'], ['s', 'Healthy'], ['l', 'Configure']],
      [['t', 'Ekart', 'Surface'], ['t', 'Forward, RTO, Reverse'], ['n', '17,988'], ['n', '54,120'], ['n', '93.1%'], ['n', '5.6%'], ['n', '98.2%'], ['s', 'Healthy'], ['l', 'Configure']],
      [['t', 'XpressBees', 'Surface'], ['t', 'Forward, RTO'], ['n', '15,640'], ['n', '32,880'], ['n', '91.4%'], ['n', '6.2%'], ['n', '97.4%'], ['s', 'Degraded'], ['l', 'Configure']],
      [['t', 'Ecom Express', 'Surface, ROS'], ['t', 'Forward, RTO, Reverse'], ['n', '21,104'], ['n', '18,440'], ['n', '88.0%'], ['n', '8.4%'], ['n', '96.1%'], ['s', 'Degraded'], ['l', 'Configure']],
      [['t', 'Shadowfax', 'Hyperlocal'], ['t', 'Forward'], ['n', '4,220'], ['n', '2,180'], ['n', '90.2%'], ['n', '7.1%'], ['n', '94.8%'], ['s', 'Suspended'], ['l', 'Configure']],
    ],
  },
  'a-zones': {
    search: 'Search zone, pincode or courier', min: '1040px', count: 'Showing 1–6 of 128 active lane mappings',
    tabs: [['All lanes', '128'], ['Metro', '42'], ['Regional', '61'], ['Remote', '25']],
    filters: ['Courier partner', 'Origin zone', 'Lane type'], tools: ['Export mapping', '+ Add lane'],
    stats: [['Active lanes', '128', '+4', 'up', 'across 8 partners'], ['Pincode coverage', '19,842', '+312', 'up', 'last sync today'], ['SLA risks', '9', '+2', 'down', 'outside delivery promise'], ['Fallback enabled', '94%', '+3pp', 'up', 'lane-level rules']],
    cols: [['Courier', 'left'], ['Origin zone', 'left'], ['Destination zone', 'left'], ['Lane type', 'left'], ['Pincodes', 'right'], ['Delivery SLA', 'left'], ['Fallback', 'left'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['t', 'Delhivery', 'Surface'], ['t', 'Bengaluru Metro'], ['t', 'Bengaluru Metro'], ['t', 'Intra-city'], ['n', '842'], ['t', '1–2 days'], ['t', 'Blue Dart'], ['s', 'Active'], ['l', 'Edit']],
      [['t', 'Blue Dart', 'Air Express'], ['t', 'Bengaluru Metro'], ['t', 'Delhi NCR'], ['t', 'Metro'], ['n', '1,204'], ['t', '1–2 days'], ['t', 'Delhivery'], ['s', 'Active'], ['l', 'Edit']],
      [['t', 'Ekart', 'Surface'], ['t', 'South Cluster'], ['t', 'Tamil Nadu'], ['t', 'Regional'], ['n', '2,480'], ['t', '2–3 days'], ['t', 'XpressBees'], ['s', 'Active'], ['l', 'Edit']],
      [['t', 'XpressBees', 'Surface'], ['t', 'West Cluster'], ['t', 'Rajasthan'], ['t', 'Regional'], ['n', '1,920'], ['t', '3–4 days'], ['t', 'Delhivery'], ['s', 'Active'], ['l', 'Edit']],
      [['t', 'Ecom Express', 'Surface'], ['t', 'North Cluster'], ['t', 'North East'], ['t', 'Remote'], ['n', '684'], ['t', '5–7 days'], ['t', 'None'], ['s', 'Degraded'], ['l', 'Review']],
      [['t', 'Shadowfax', 'Hyperlocal'], ['t', 'Bengaluru Metro'], ['t', 'Bengaluru Metro'], ['t', 'Intra-city'], ['n', '312'], ['t', 'Same day'], ['t', 'None'], ['s', 'Suspended'], ['l', 'Review']],
    ],
  },
  'a-sla': {
    search: 'Search courier or service level', min: '1020px', count: 'Showing 1–6 of 24 SLA policies',
    tabs: [['All policies', '24'], ['Within guardrail', '18'], ['Watch', '4'], ['Breached', '2']],
    filters: ['Courier partner', 'Service type', 'Policy status'], tools: ['Export policies', '+ Create policy'],
    stats: [['Policies live', '24', '+2', 'up', 'across 8 partners'], ['Within SLA', '18', '+1', 'up', 'last 7 days'], ['At risk', '4', '+1', 'down', 'review before cutoff'], ['Breached', '2', '−1', 'up', 'escalation open']],
    cols: [['Courier', 'left'], ['Service', 'left'], ['Pickup promise', 'left'], ['Delivery promise', 'left'], ['Breach threshold', 'left'], ['Current SLA', 'right'], ['Status', 'left'], ['Updated', 'left'], ['', 'right']],
    rows: [
      [['t', 'Delhivery', 'Surface'], ['t', 'Forward'], ['t', 'Same day'], ['t', '2–4 days'], ['t', '95%'], ['n', '96.2%'], ['s', 'Healthy'], ['t', 'Today, 09:20'], ['l', 'Configure']],
      [['t', 'Blue Dart', 'Air Express'], ['t', 'Forward'], ['t', 'Same day'], ['t', '1–2 days'], ['t', '97%'], ['n', '97.8%'], ['s', 'Healthy'], ['t', 'Today, 09:20'], ['l', 'Configure']],
      [['t', 'Ekart', 'Surface'], ['t', 'Forward'], ['t', 'Next day'], ['t', '3–5 days'], ['t', '94%'], ['n', '93.1%'], ['s', 'Degraded'], ['t', 'Yesterday'], ['l', 'Configure']],
      [['t', 'XpressBees', 'Surface'], ['t', 'Forward'], ['t', 'Next day'], ['t', '3–5 days'], ['t', '93%'], ['n', '91.4%'], ['s', 'Degraded'], ['t', 'Yesterday'], ['l', 'Configure']],
      [['t', 'Ecom Express', 'Surface'], ['t', 'RTO'], ['t', 'Next day'], ['t', '4–6 days'], ['t', '90%'], ['n', '88.0%'], ['s', 'Degraded'], ['t', '02 Sep'], ['l', 'Configure']],
      [['t', 'Shadowfax', 'Hyperlocal'], ['t', 'Forward'], ['t', 'Same day'], ['t', 'Same day'], ['t', '92%'], ['n', '90.2%'], ['s', 'Suspended'], ['t', '29 Aug'], ['l', 'Configure']],
    ],
  },
  'a-performance': {
    search: 'Search courier partner', min: '1040px', count: 'Showing 1–6 of 8 active courier partners',
    tabs: [['All partners', '8'], ['Above target', '3'], ['Watchlist', '3'], ['Escalated', '2']],
    filters: ['Service type', 'Performance period', 'Zone'], tools: ['Export report', 'Schedule report'],
    stats: [['Network delivery', '93.8%', '+0.6pp', 'up', 'blended rate'], ['Avg delivery', '2.7d', '−0.2d', 'up', 'across 2.41L shipments'], ['Pickup compliance', '96.2%', '+1.1pp', 'up', 'all hubs'], ['NDR recovery', '64.1%', '+1.4pp', 'up', 'last 30 days']],
    cols: [['Courier', 'left'], ['Shipments', 'right'], ['Delivery rate', 'right'], ['First attempt', 'right'], ['NDR rate', 'right'], ['Avg delivery', 'right'], ['Pickup SLA', 'right'], ['Trend', 'left'], ['', 'right']],
    rows: [
      [['t', 'Delhivery', 'Surface'], ['n', '92,410'], ['n', '96.2%'], ['n', '89.8%'], ['n', '4.1%'], ['n', '2.3d'], ['n', '97.1%'], ['s', 'Healthy'], ['l', 'View report']],
      [['t', 'Blue Dart', 'Air Express'], ['n', '38,660'], ['n', '97.8%'], ['n', '92.2%'], ['n', '2.8%'], ['n', '1.6d'], ['n', '98.4%'], ['s', 'Healthy'], ['l', 'View report']],
      [['t', 'Ekart', 'Surface'], ['n', '54,120'], ['n', '93.1%'], ['n', '85.4%'], ['n', '5.6%'], ['n', '2.9d'], ['n', '95.2%'], ['s', 'Healthy'], ['l', 'View report']],
      [['t', 'XpressBees', 'Surface'], ['n', '32,880'], ['n', '91.4%'], ['n', '82.9%'], ['n', '6.2%'], ['n', '3.2d'], ['n', '94.0%'], ['s', 'Degraded'], ['l', 'View report']],
      [['t', 'Ecom Express', 'Surface'], ['n', '18,440'], ['n', '88.0%'], ['n', '78.6%'], ['n', '8.4%'], ['n', '3.8d'], ['n', '92.1%'], ['s', 'Degraded'], ['l', 'View report']],
      [['t', 'Shadowfax', 'Hyperlocal'], ['n', '2,180'], ['n', '90.2%'], ['n', '84.8%'], ['n', '7.1%'], ['n', '1.1d'], ['n', '89.4%'], ['s', 'Suspended'], ['l', 'View report']],
    ],
  },
  'a-ndr': {
    search: 'Search AWB, seller or reason', min: '1060px', count: 'Showing 1–6 of 18,642 NDR shipments',
    tabs: [['All', '18.6k'], ['Unactioned', '4.2k'], ['Seller actioned', '11.1k'], ['Auto-RTO', '3.3k']],
    filters: ['All sellers', 'All couriers', 'Reason'], tools: ['Export CSV'],
    stats: [['Platform NDR', '18.6k', '+1.2k', 'down', '7.7% of volume'], ['Unactioned', '4.2k', '+380', 'down', 'auto-RTO in 24h'], ['COD at risk', '₹2.4Cr', '+₹18L', 'down', 'platform-wide'], ['Reattempt success', '64.1%', '+1.4pp', 'up', 'last 30 days']],
    cols: [['AWB', 'left'], ['Seller', 'left'], ['Courier', 'left'], ['Reason', 'left'], ['Attempt', 'left'], ['COD', 'right'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['m', 'XB8814402991'], ['t', 'Delhi Denim Co.', '47812'], ['t', 'XpressBees'], ['t', 'Customer unavailable'], ['t', '2 of 3'], ['n', '₹1,880'], ['s', 'Unactioned'], ['l', 'Open']],
      [['m', 'ECOM88210044'], ['t', 'Karma Living', '48291'], ['t', 'Ecom Express'], ['t', 'Customer unavailable'], ['t', '2 of 3'], ['n', '₹960'], ['s', 'Unactioned'], ['l', 'Open']],
      [['m', '9920144718802'], ['t', 'Urban Threads', '48104'], ['t', 'Blue Dart'], ['t', 'Refused delivery'], ['t', '1 of 3'], ['n', '₹3,240'], ['s', 'Actioned'], ['l', 'Open']],
      [['m', 'EK9930411002'], ['t', 'Karma Living', '48291'], ['t', 'Ekart'], ['t', 'Address incomplete'], ['t', '1 of 3'], ['n', '₹1,540'], ['s', 'Unactioned'], ['l', 'Open']],
      [['m', 'ECOM77120388'], ['t', 'Kochi Spice House', '47640'], ['t', 'Ecom Express'], ['t', 'Payment not ready'], ['t', '3 of 3'], ['n', '₹2,180'], ['s', 'RTO'], ['l', 'Open']],
      [['m', '2839470118211'], ['t', 'Jaipur Blockworks', '47501'], ['t', 'Delhivery'], ['t', 'Address incomplete'], ['t', '2 of 3'], ['n', '₹740'], ['s', 'Actioned'], ['l', 'Open']],
    ],
  },
  'a-cod': {
    search: 'Search payout reference or seller', min: '1020px', count: 'Showing 1–6 of 962 seller payouts',
    tabs: [['All', '962'], ['Pending', '148'], ['Remitted', '814']],
    filters: ['All sellers', 'Cycle', 'Bank'], tools: ['Approve payouts', 'Export CSV'],
    stats: [['Collected (30d)', '₹11.2Cr', '+9.8%', 'up', 'across 962 sellers'], ['Remitted', '₹10.4Cr', '+9.2%', 'up', '814 payouts closed'], ['Pending approval', '₹64.2L', '+₹8.1L', 'flat', '148 payouts'], ['Held', '₹18.4L', '+₹2.2L', 'down', 'disputes and KYC']],
    cols: [['Payout reference', 'left'], ['Seller', 'left'], ['Cycle', 'left'], ['Shipments', 'right'], ['Collected', 'right'], ['Net payable', 'right'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['m', 'PO-2026-0418'], ['t', 'Karma Living', '48291'], ['t', '30 Aug – 05 Sep'], ['n', '612'], ['n', '₹1,34,820'], ['n', '₹1,16,940'], ['s', 'Pending'], ['l', 'Approve']],
      [['m', 'PO-2026-0417'], ['t', 'Urban Threads', '48104'], ['t', '30 Aug – 05 Sep'], ['n', '2,884'], ['n', '₹6,42,180'], ['n', '₹5,71,220'], ['s', 'Pending'], ['l', 'Approve']],
      [['m', 'PO-2026-0416'], ['t', 'Delhi Denim Co.', '47812'], ['t', '30 Aug – 05 Sep'], ['n', '486'], ['n', '₹98,440'], ['n', '₹86,180'], ['s', 'Pending'], ['l', 'Approve']],
      [['m', 'PO-2026-0409'], ['t', 'Jaipur Blockworks', '47501'], ['t', '23 – 29 Aug'], ['n', '164'], ['n', '₹34,220'], ['n', '₹29,880'], ['s', 'Remitted'], ['l', 'Open']],
      [['m', 'PO-2026-0402'], ['t', 'Nashik Naturals', '47990'], ['t', '23 – 29 Aug'], ['n', '92'], ['n', '₹18,640'], ['n', '₹16,120'], ['s', 'Remitted'], ['l', 'Open']],
      [['m', 'PO-2026-0398'], ['t', 'Kochi Spice House', '47640'], ['t', '23 – 29 Aug'], ['n', '218'], ['n', '₹46,880'], ['n', '₹0'], ['s', 'Failed'], ['l', 'Open']],
    ],
  },
  'a-jobs': {
    search: 'Search job name or run ID', min: '1000px', count: 'Showing 1–7 of 4,812 runs today',
    tabs: [['All', '4,812'], ['Running', '18'], ['Queued', '42'], ['Failed', '11']],
    filters: ['Job type', 'Last 24 hours'], tools: ['Retry failed', 'View schedule'],
    stats: [['Runs today', '4,812', '+312', 'flat', '99.8% success'], ['Running', '18', '', 'flat', 'longest 4m 12s'], ['Queued', '42', '+8', 'flat', 'avg wait 6s'], ['Failed', '11', '+3', 'down', '9 retried automatically']],
    cols: [['Run ID', 'left'], ['Job', 'left'], ['Scope', 'left'], ['Started', 'left'], ['Duration', 'right'], ['Records', 'right'], ['Status', 'left'], ['', 'right']],
    rows: [
      [['m', 'RUN-99284102'], ['t', 'Channel order sync'], ['t', 'Amazon.in · all sellers'], ['t', '09:40:12'], ['n', '1m 48s'], ['n', '18,442'], ['s', 'Running'], ['l', 'Logs']],
      [['m', 'RUN-99284088'], ['t', 'Courier scan pull'], ['t', 'Delhivery'], ['t', '09:38:04'], ['n', '2m 06s'], ['n', '92,410'], ['s', 'Success'], ['l', 'Logs']],
      [['m', 'RUN-99284071'], ['t', 'Manifest generation'], ['t', 'All warehouses'], ['t', '09:30:00'], ['n', '54s'], ['n', '2,884'], ['s', 'Success'], ['l', 'Logs']],
      [['m', 'RUN-99284055'], ['t', 'COD reconciliation'], ['t', 'Cycle PO-2026-0418'], ['t', '09:15:00'], ['n', '4m 12s'], ['n', '11,204'], ['s', 'Running'], ['l', 'Logs']],
      [['m', 'RUN-99284040'], ['t', 'Weight discrepancy import'], ['t', 'Ekart'], ['t', '09:00:00'], ['n', '38s'], ['n', '46'], ['s', 'Failed'], ['l', 'Logs']],
      [['m', 'RUN-99284022'], ['t', 'Webhook delivery'], ['t', 'All subscribers'], ['t', '08:55:00'], ['n', '12s'], ['n', '8,412'], ['s', 'Success'], ['l', 'Logs']],
      [['m', 'RUN-99284009'], ['t', 'Invoice generation'], ['t', 'Aug 2026 cycle'], ['t', '08:30:00'], ['n', 'N/A'], ['n', '1,284'], ['s', 'Queued'], ['l', 'Logs']],
    ],
  },
};

export const CONNECTORS = {
  amazon: ['Amazon.in', 'Marketplace', 'Connected', 'AMZ-SELLER-40291', '18,442 orders synced · last run 09:40 today', 'Seller Central MWS', ['Amazon.in Karma Living', 'IN marketplace', 'Every 15 minutes', 'FBM only']],
  shopify: ['Shopify', 'Storefront', 'Connected', 'karmaliving.myshopify.com', '9,884 orders synced · last run 09:38 today', 'Admin API 2026-01', ['karmaliving.myshopify.com', 'INR store', 'Real-time webhook', 'Paid orders only']],
  woo: ['WooCommerce', 'Storefront', 'Connected', 'karmaliving.in/wp', '4,120 orders synced · last run 09:35 today', 'REST API v3', ['karmaliving.in', 'INR store', 'Every 30 minutes', 'Processing status']],
  opencart: ['OpenCart', 'Storefront', 'Not connected', 'N/A', 'Never synced', 'REST extension 4.x', ['N/A', 'N/A', 'N/A', 'N/A']],
  magento: ['Magento', 'Storefront', 'Not connected', 'N/A', 'Never synced', 'Adobe Commerce 2.4', ['N/A', 'N/A', 'N/A', 'N/A']],
  'wa-api': ['WhatsApp API', 'Notifications', 'Connected', 'WABA 10284471', '48,204 messages sent this month · 99.2% delivered', 'Cloud API v20', ['+91 80456 11902', 'Karma Living (verified)', '6 approved templates', 'Tier 2 · 10k/day']],
  'sms-api': ['SMS API', 'Notifications', 'Connected', 'DLT 1102847710284', '112,880 messages sent this month · 97.8% delivered', 'MSG91 v5', ['KRMLIV', 'Transactional', '4 approved templates', 'Unlimited']],
};

export const FORMS = {
  warehouse: { cols: '1fr 340px', sections: [
    { label: 'Primary pickup location', sub: 'Couriers collect from this address unless a shipment overrides it', cols: '1fr 1fr', fields: [
      ['f', 'Warehouse name', 'Bengaluru, Bommasandra', 'span 1'], ['f', 'Warehouse code', 'BLR-BOM-01', 'span 1'],
      ['f', 'Address line 1', 'Plot 44, Bommasandra Industrial Area', 'span 2'], ['f', 'Address line 2', 'Anekal Taluk', 'span 2'],
      ['f', 'Pincode', '560068', 'span 1', 'Serviceable by 7 couriers'], ['f', 'City', 'Bengaluru', 'span 1'],
      ['f', 'State', 'Karnataka', 'span 1'], ['f', 'Contact person', 'Anita Rao', 'span 1'],
      ['f', 'Contact number', '+91 80456 11902', 'span 1'], ['f', 'Pickup cutoff', '4:30 PM', 'span 1', 'Orders after cutoff move to next day'],
      ['g', 'Allow reverse pickups at this location', '', 'span 2', 'Returns and RTO shipments are received here'],
      ['h', 'Use a separate return address', '', 'span 2', 'When off, RTO comes back to the pickup address'],
    ], footer: 'Changes apply to new shipments only' },
  ], aside: [
    { label: 'All warehouses', rows: [['Bengaluru, Bommasandra', 'Primary'], ['Bengaluru, Peenya Annex', 'Verified'], ['Pune, Chakan', 'Pending KYC']] },
    { label: 'Pickup performance', rows: [['Compliance (30d)', '97.1%'], ['Missed pickups', '32'], ['Avg pickup time', '3:42 PM']] },
  ] },
  kyc: { cols: '1fr 340px', sections: [
    { label: 'Business identity', sub: 'Verified against GSTIN and PAN records', cols: '1fr 1fr', fields: [
      ['f', 'Legal entity name', 'Karma Living Retail Pvt. Ltd.', 'span 2'],
      ['f', 'GSTIN', '29AABCK4821L1ZP', 'span 1', 'Verified 14 Feb 2026'], ['f', 'PAN', 'AABCK4821L', 'span 1', 'Verified 14 Feb 2026'],
      ['f', 'Entity type', 'Private limited company', 'span 1'], ['f', 'Business category', 'Home furnishing', 'span 1'],
      ['f', 'Registered address', 'Plot 44, Bommasandra Industrial Area, Bengaluru 560068', 'span 2'],
      ['f', 'Signatory name', 'Anita Rao', 'span 1'], ['f', 'Signatory Aadhaar', 'XXXX XXXX 4412', 'span 1', 'Verified via OTP'],
    ] },
    { label: 'Bank account for COD remittance', cols: '1fr 1fr', fields: [
      ['f', 'Account holder', 'Karma Living Retail Pvt. Ltd.', 'span 2'],
      ['f', 'Account number', 'XXXXXXXX4412', 'span 1'], ['f', 'IFSC', 'HDFC0000521', 'span 1', 'HDFC Bank, Bommasandra'],
      ['f', 'Cancelled cheque', 'cheque-hdfc-4412.pdf', 'span 2', 'Uploaded 14 Feb 2026 · verified'],
    ], footer: 'KYC is complete. Changes trigger re-verification.' },
  ], aside: [
    { label: 'Verification status', body: 'All documents verified. COD remittance and reverse pickup are enabled on this account.', rows: [['GSTIN', 'Verified'], ['PAN', 'Verified'], ['Bank account', 'Verified'], ['Signatory', 'Verified']] },
  ] },
  'courier-rules': { cols: '1fr 340px', sections: [
    { label: 'Allocation strategy', sub: 'Applied in order until a courier matches', cols: '1fr 1fr', fields: [
      ['f', 'Default strategy', 'Cheapest serviceable courier', 'span 1'], ['f', 'Fallback strategy', 'Highest delivery rate', 'span 1'],
      ['f', 'Rule 1: COD above ₹5,000', 'Blue Dart Air Express', 'span 2', 'Lowest RTO exposure on high-value COD'],
      ['f', 'Rule 2: Metro to metro under 1 kg', 'Delhivery Surface', 'span 2'],
      ['f', 'Rule 3: Pincode NDR rate above 8%', 'Ecom Express ROS', 'span 2'],
      ['f', 'Rule 4: Weight above 5 kg', 'Ekart Surface', 'span 2'],
      ['g', 'Skip couriers with API downtime', '', 'span 2', 'Falls through to the next matching rule automatically'],
      ['g', 'Respect channel-specific SLA promises', '', 'span 2', 'Amazon.in orders always use an air service'],
    ], footer: 'Rules are evaluated top to bottom at booking time' },
  ], aside: [
    { label: 'Rule impact (30d)', rows: [['Shipments auto-allocated', '3,884'], ['Manual overrides', '34'], ['Avg freight saved', '₹18 / shipment'], ['Rules currently active', '4 of 6']] },
  ] },
  label: { cols: '1fr 340px', sections: [
    { label: 'Label format', cols: '1fr 1fr', fields: [
      ['f', 'Label size', '4 × 6 in (thermal)', 'span 1'], ['f', 'Labels per sheet', '1', 'span 1'],
      ['f', 'Barcode format', 'Code 128', 'span 1'], ['f', 'Output format', 'PDF', 'span 1'],
      ['g', 'Show your brand name and logo', '', 'span 2', 'Replaces the NEXGO mark on the label header'],
      ['g', 'Show product name and SKU', '', 'span 2'],
      ['h', 'Show order value on the label', '', 'span 2', 'Hidden by default on prepaid shipments'],
      ['g', 'Show COD amount in bold', '', 'span 2'],
      ['h', 'Include a return address block', '', 'span 2'],
    ], footer: 'Applies to labels generated after saving' },
  ], aside: [
    { label: 'Label preview', body: 'A 4 × 6 in thermal label with your logo, Code 128 AWB barcode, COD amount in bold and the pickup address block.', rows: [['Last printed', '02 Sep, 11:48'], ['Printed this month', '3,918'], ['Printer profile', 'TSC TE244']] },
  ] },
  'inv-settings': { cols: '1fr 340px', sections: [
    { label: 'Tax invoice defaults', cols: '1fr 1fr', fields: [
      ['f', 'Invoice prefix', 'KL/26-27/', 'span 1'], ['f', 'Next invoice number', '4813', 'span 1'],
      ['f', 'Place of supply', 'Karnataka (29)', 'span 1'], ['f', 'Default HSN code', '63041000', 'span 1'],
      ['f', 'Default GST rate', '18%', 'span 1'], ['f', 'Invoice terms', 'Payable on delivery', 'span 1'],
      ['g', 'Auto-generate invoice on booking', '', 'span 2', 'Attaches a tax invoice PDF to every shipment'],
      ['g', 'Include invoice in courier documentation', '', 'span 2'],
      ['h', 'Show discount lines separately', '', 'span 2'],
    ], footer: 'Invoice numbering is sequential and cannot be reset mid-year' },
  ], aside: [
    { label: 'This financial year', rows: [['Invoices issued', '4,812'], ['Taxable value', '₹1.84Cr'], ['GST collected', '₹33.1L'], ['Series', 'KL/26-27/']] },
  ] },
  webhook: { cols: '1fr 340px', sections: [
    { label: 'Endpoint', cols: '1fr 1fr', fields: [
      ['f', 'Endpoint URL', 'https://karmaliving.in/api/nexgo/webhook', 'span 2'],
      ['f', 'Signing secret', 'whsec_••••••••••••4412', 'span 1', 'Rotated 12 Aug 2026'], ['f', 'API version', '2026-01', 'span 1'],
      ['f', 'Retry policy', '5 attempts, exponential backoff', 'span 2'],
    ] },
    { label: 'Subscribed events', cols: '1fr 1fr', fields: [
      ['g', 'shipment.booked', '', 'span 1'], ['g', 'shipment.picked_up', '', 'span 1'],
      ['g', 'shipment.in_transit', '', 'span 1'], ['g', 'shipment.out_for_delivery', '', 'span 1'],
      ['g', 'shipment.delivered', '', 'span 1'], ['g', 'shipment.ndr_raised', '', 'span 1'],
      ['g', 'shipment.rto_initiated', '', 'span 1'], ['h', 'wallet.low_balance', '', 'span 1'],
      ['h', 'invoice.generated', '', 'span 1'], ['h', 'weight.discrepancy_raised', '', 'span 1'],
    ], footer: '7 of 10 events subscribed' },
  ], aside: [
    { label: 'Delivery log (24h)', rows: [['Delivered', '8,412'], ['Failed', '11'], ['Avg latency', '184 ms'], ['Last failure', '02 Sep, 22:14']] },
  ] },
  notifications: { cols: '1fr 340px', sections: [
    { label: 'Customer notifications', sub: 'Sent automatically on shipment events', cols: '1fr 1fr', fields: [
      ['g', 'WhatsApp: shipment booked', '', 'span 1'], ['g', 'WhatsApp: out for delivery', '', 'span 1'],
      ['g', 'WhatsApp: delivery failed (NDR)', '', 'span 1'], ['g', 'SMS: shipment booked', '', 'span 1'],
      ['g', 'SMS: out for delivery', '', 'span 1'], ['h', 'SMS: delivered', '', 'span 1'],
      ['g', 'Email: tracking link', '', 'span 1'], ['h', 'Email: feedback request', '', 'span 1'],
    ] },
    { label: 'Internal alerts', cols: '1fr 1fr', fields: [
      ['f', 'Alert recipients', 'anita@karmaliving.in, ops@karmaliving.in', 'span 2'],
      ['g', 'Wallet balance below ₹10,000', '', 'span 1'], ['g', 'Pickup missed', '', 'span 1'],
      ['g', 'NDR awaiting action for 12 hours', '', 'span 1'], ['g', 'Weight discrepancy raised', '', 'span 1'],
      ['h', 'Daily operations digest at 9 AM', '', 'span 1'], ['h', 'Channel sync failure', '', 'span 1'],
    ], footer: 'Internal alerts go to email and the in-app notification centre' },
  ], aside: [
    { label: 'Sent this month', rows: [['WhatsApp', '48,204'], ['SMS', '1,12,880'], ['Email', '22,410'], ['Delivery rate', '98.4%']] },
  ] },
  profile: { cols: '1fr 340px', sections: [
    { label: 'Your account', cols: '1fr 1fr', fields: [
      ['f', 'Full name', 'Anita Rao', 'span 1'], ['f', 'Role', 'Owner', 'span 1'],
      ['f', 'Work email', 'anita@karmaliving.in', 'span 1', 'Used for sign-in and alerts'], ['f', 'Mobile number', '+91 80456 11902', 'span 1'],
      ['f', 'Time zone', 'Asia/Kolkata (IST)', 'span 1'], ['f', 'Language', 'English (India)', 'span 1'],
      ['g', 'Two-factor authentication', '', 'span 2', 'Required for wallet withdrawals and KYC changes'],
    ] },
    { label: 'Business profile', cols: '1fr 1fr', fields: [
      ['f', 'Display name', 'Karma Living', 'span 1'], ['f', 'Seller ID', '48291', 'span 1'],
      ['f', 'Support email', 'support@karmaliving.in', 'span 1'], ['f', 'Support phone', '+91 80456 11900', 'span 1'],
      ['f', 'Plan', 'Growth · ₹2,499 / month', 'span 2', 'Renews 01 Oct 2026'],
    ], footer: 'Team members can be managed from the Team tab' },
  ], aside: [
    { label: 'Team', rows: [['Anita Rao', 'Owner'], ['Vikram Suresh', 'Operations'], ['Neha Patel', 'Finance'], ['Karthik R.', 'Read only']] },
    { label: 'Recent sign-ins', rows: [['Chrome · Bengaluru', 'Today 09:12'], ['Chrome · Bengaluru', 'Yesterday 18:40'], ['iOS app · Bengaluru', '01 Sep 08:22']] },
  ] },
  password: { cols: '1fr 340px', sections: [
    { label: 'Change password', sub: 'You will stay signed in on this device', cols: '1fr', fields: [
      ['f', 'Current password', '••••••••••••', 'span 1'],
      ['f', 'New password', '••••••••••••••••', 'span 1', 'At least 12 characters with a number and a symbol'],
      ['f', 'Confirm new password', '••••••••••••••••', 'span 1'],
      ['g', 'Sign out of all other devices', '', 'span 1', 'Ends 2 other active sessions'],
    ], footer: 'Last changed 14 Feb 2026' },
  ], aside: [
    { label: 'Password strength', body: 'Strong. 16 characters, mixed case, numbers and symbols. Not found in any known breach list.', rows: [['Length', '16 characters'], ['Breach check', 'Clean'], ['2FA', 'Enabled']] },
  ] },
  b2c: { cols: '1fr 340px', sections: [
    { label: 'Customer details', cols: '1fr 1fr', fields: [
      ['f', 'Full name', 'Rohit Menon', 'span 1'], ['f', 'Phone number', '+91 98450 22117', 'span 1'],
      ['f', 'Email', 'rohit.menon@gmail.com', 'span 2'],
      ['f', 'Address line 1', 'Flat 402, Prestige Ferns Residency', 'span 2'],
      ['f', 'Address line 2', 'Harlur Road, HSR Layout Sector 2', 'span 2'],
      ['f', 'Pincode', '560102', 'span 1', 'Serviceable by 7 couriers'], ['f', 'City', 'Bengaluru', 'span 1'],
      ['f', 'State', 'Karnataka', 'span 1'], ['f', 'Country', 'India', 'span 1'],
    ] },
    { label: 'Order and package', cols: '1fr 1fr 1fr 1fr', fields: [
      ['f', 'Order ID', 'KL-24818', 'span 2'], ['f', 'Order date', '03 Sep 2026', 'span 2'],
      ['f', 'Product name', 'Linen Cushion Cover Set of 4', 'span 3'], ['f', 'Quantity', '4', 'span 1'],
      ['f', 'SKU', 'KL-CUSH-004', 'span 2'], ['f', 'HSN code', '63041000', 'span 2'],
      ['f', 'Dead weight', '1.80', 'span 1', '', 'kg'], ['f', 'Length', '25', 'span 1', '', 'cm'],
      ['f', 'Breadth', '18', 'span 1', '', 'cm'], ['f', 'Height', '10', 'span 1', '', 'cm'],
      ['f', 'Order value', '2,480.00', 'span 2', '', '₹'], ['f', 'COD to collect', '2,480.00', 'span 2', '', '₹'],
    ], footer: 'Volumetric weight 2.25 kg will be billed' },
  ], aside: [
    { label: 'Chargeable weight', body: 'Volumetric weight (2.25 kg) exceeds dead weight (1.80 kg). Couriers bill the higher of the two.', rows: [['Dead weight', '1.80 kg'], ['Volumetric', '2.25 kg'], ['Billed slab', '2.50 kg']] },
    { label: 'Estimated freight', rows: [['Cheapest', '₹142.50'], ['Fastest', '₹268.00'], ['Recommended', 'Delhivery Surface']] },
  ] },
  reverse: { cols: '1fr 340px', sections: [
    { label: 'Return pickup', sub: 'The courier collects from the customer and returns to your warehouse', cols: '1fr 1fr', fields: [
      ['f', 'Original AWB', '2839470918822', 'span 1'], ['f', 'Original order', 'KL-24788', 'span 1'],
      ['f', 'Return reason', 'Size or fit issue', 'span 2'],
      ['f', 'Pickup from', 'Priya Nair, Kochi 682020', 'span 2'],
      ['f', 'Pickup contact', '+91 98470 33188', 'span 1'], ['f', 'Preferred pickup date', '05 Sep 2026', 'span 1'],
      ['f', 'Return to warehouse', 'Bengaluru, Bommasandra', 'span 2'],
      ['f', 'Refund amount', '3,150.00', 'span 1', '', '₹'], ['f', 'Refund mode', 'Original payment method', 'span 1'],
      ['g', 'Quality check before refund', '', 'span 2', 'Refund is released after the item passes QC at the warehouse'],
      ['h', 'Collect a return shipping fee from the customer', '', 'span 2'],
    ], footer: 'Reverse pickup charge ₹96 will be debited on booking' },
  ], aside: [
    { label: 'Reverse charges', rows: [['Pickup charge', '₹96.00'], ['GST (18%)', '₹17.28'], ['Total debit', '₹113.28']] },
    { label: 'Return window', body: 'Delivered 01 Sep. The 7-day return window closes on 08 September 2026.', rows: [['Delivered', '01 Sep'], ['Window closes', '08 Sep'], ['Couriers available', '4']] },
  ] },
  ratecalc: { cols: '1fr 340px', sections: [
    { label: 'Shipment inputs', cols: '1fr 1fr 1fr 1fr', fields: [
      ['f', 'Pickup pincode', '560068', 'span 2', 'Bengaluru, Karnataka'], ['f', 'Delivery pincode', '400072', 'span 2', 'Mumbai, Maharashtra · Zone C'],
      ['f', 'Dead weight', '2.40', 'span 1', '', 'kg'], ['f', 'Length', '30', 'span 1', '', 'cm'],
      ['f', 'Breadth', '22', 'span 1', '', 'cm'], ['f', 'Height', '14', 'span 1', '', 'cm'],
      ['f', 'Payment mode', 'Cash on delivery', 'span 2'], ['f', 'Shipment value', '3,480.00', 'span 2', '', '₹'],
      ['g', 'Include RTO charges in the estimate', '', 'span 2', 'Shows worst-case cost if the shipment returns'],
    ], footer: 'Chargeable weight 2.50 kg (volumetric 1.85 kg)' },
  ], aside: [
    { label: 'Estimated rates', rows: [['Ecom Express ROS', '₹186.00'], ['Delhivery Surface', '₹198.00'], ['Ekart Surface', '₹212.00'], ['XpressBees Surface', '₹224.00'], ['Blue Dart Air', '₹412.00']] },
    { label: 'Zone', body: 'Bengaluru to Mumbai is Zone C on your rate card. Surface transit is 3–4 days, air is next day.', rows: [['Zone', 'C'], ['Surface transit', '3–4 days'], ['Air transit', 'Next day']] },
  ] },
  pincode: { cols: '1fr 340px', sections: [
    { label: 'Check serviceability', cols: '1fr 1fr', fields: [
      ['f', 'Pincode', '400072', 'span 1', 'Mumbai, Maharashtra'], ['f', 'Service type', 'Forward + COD', 'span 1'],
      ['f', 'Weight', '2.50', 'span 1', '', 'kg'], ['f', 'Shipment value', '3,480.00', 'span 1', '', '₹'],
    ] },
    { label: 'Courier coverage for 400072', sub: '6 of 8 couriers serve this pincode', cols: '1fr 1fr', fields: [
      ['f', 'Delhivery', 'Forward, COD, Reverse · 3 days', 'span 2'],
      ['f', 'Blue Dart', 'Forward, COD · next day', 'span 2'],
      ['f', 'Ekart', 'Forward, COD, Reverse · 4 days', 'span 2'],
      ['f', 'XpressBees', 'Forward, COD · 4 days', 'span 2'],
      ['f', 'Ecom Express', 'Forward, COD, Reverse · 3 days', 'span 2'],
      ['f', 'Shadowfax', 'Not serviceable', 'span 2'],
    ] },
  ], aside: [
    { label: 'Pincode profile', rows: [['Zone', 'C'], ['Region', 'West'], ['ODA', 'No'], ['NDR rate', '4.8%'], ['Delivery rate', '95.2%']] },
    { label: 'Bulk check', body: 'Upload a CSV of up to 50,000 pincodes to get a serviceability matrix across every courier.', rows: [['Last upload', '28 Aug'], ['Pincodes checked', '29,140']] },
  ] },
  whatsapp: { cols: '1fr 340px', sections: [
    { label: 'New broadcast campaign', cols: '1fr 1fr', fields: [
      ['f', 'Campaign name', 'Monsoon restock: cushion covers', 'span 2'],
      ['f', 'Template', 'restock_alert_v3 (approved)', 'span 1'], ['f', 'Audience', 'Delivered buyers, last 90 days', 'span 1'],
      ['f', 'Audience size', '8,412 contacts', 'span 1'], ['f', 'Estimated cost', '₹6,730 (₹0.80 / message)', 'span 1'],
      ['f', 'Message preview', 'Hi {{name}}, the linen cushion covers you bought are back in indigo. Tap to reorder before 10 Sep.', 'span 2'],
      ['f', 'Send window', '05 Sep 2026, 11:00 AM IST', 'span 2'],
      ['g', 'Skip contacts who opted out', '', 'span 2'],
      ['g', 'Stop sending if wallet drops below ₹5,000', '', 'span 2'],
    ], footer: 'Broadcasts are debited from your wallet at send time' },
  ], aside: [
    { label: 'Recent campaigns', rows: [['Monsoon teaser', '42.1% opened'], ['Onam offer', '38.4% opened'], ['Restock alert v2', '44.8% opened'], ['Win-back Jul', '29.2% opened']] },
    { label: 'This month', rows: [['Messages sent', '48,204'], ['Delivered', '99.2%'], ['Read', '41.6%'], ['Spend', '₹38,563']] },
  ] },
  email: { cols: '1fr 340px', sections: [
    { label: 'New email campaign', cols: '1fr 1fr', fields: [
      ['f', 'Campaign name', 'Post-purchase care guide', 'span 2'],
      ['f', 'Subject line', 'How to keep your linen looking new', 'span 2'],
      ['f', 'From name', 'Karma Living', 'span 1'], ['f', 'Reply-to', 'support@karmaliving.in', 'span 1'],
      ['f', 'Audience', 'Delivered buyers, 3–30 days ago', 'span 1'], ['f', 'Audience size', '4,188 contacts', 'span 1'],
      ['f', 'Template', 'post_purchase_care', 'span 2'],
      ['f', 'Send window', '06 Sep 2026, 10:00 AM IST', 'span 2'],
      ['g', 'Suppress contacts emailed in the last 7 days', '', 'span 2'],
      ['h', 'Send a follow-up to non-openers after 3 days', '', 'span 2'],
    ], footer: 'Email is included in your Growth plan up to 50,000 sends per month' },
  ], aside: [
    { label: 'Recent campaigns', rows: [['August newsletter', '31.2% opened'], ['Care guide v1', '38.8% opened'], ['Win-back 60d', '18.4% opened']] },
    { label: 'This month', rows: [['Emails sent', '22,410'], ['Delivered', '98.4%'], ['Opened', '32.1%'], ['Clicked', '6.4%']] },
  ] },
  mis: { cols: '1fr 340px', sections: [
    { label: 'Scheduled reports', sub: 'Delivered to your team by email', cols: '1fr 1fr', fields: [
      ['f', 'Daily operations summary', 'Every day 9:00 AM · 3 recipients', 'span 2'],
      ['f', 'Weekly courier scorecard', 'Every Monday 9:00 AM · 2 recipients', 'span 2'],
      ['f', 'Monthly COD reconciliation', '1st of month 9:00 AM · 2 recipients', 'span 2'],
      ['f', 'NDR ageing report', 'Every day 6:00 PM · 3 recipients', 'span 2'],
    ] },
    { label: 'Generate a report now', cols: '1fr 1fr', fields: [
      ['f', 'Report type', 'Shipment register', 'span 1'], ['f', 'Date range', '05 Aug – 03 Sep 2026', 'span 1'],
      ['f', 'Group by', 'Courier', 'span 1'], ['f', 'Format', 'CSV', 'span 1'],
      ['f', 'Filters', 'All warehouses · all channels · all statuses', 'span 2'],
      ['g', 'Email me when the report is ready', '', 'span 2', 'Large exports run in the background'],
    ], footer: 'Reports are retained for 90 days' },
  ], aside: [
    { label: 'Available reports', rows: [['Shipment register', 'CSV, XLSX'], ['Order register', 'CSV, XLSX'], ['COD remittance', 'CSV, PDF'], ['Courier scorecard', 'PDF'], ['NDR ageing', 'CSV'], ['Weight disputes', 'CSV'], ['Wallet ledger', 'CSV, PDF']] },
    { label: 'Recent exports', rows: [['Shipment register', '02 Sep'], ['COD remittance', '01 Sep'], ['NDR ageing', '01 Sep']] },
  ] },
  ratecard: { cols: '1fr 340px', sections: [
    { label: 'Delhivery Surface: negotiated slabs', sub: 'Effective 01 Apr 2026 · forward charges per shipment', cols: '1fr 1fr 1fr 1fr', fields: [
      ['f', 'Zone A: first 500 g', '32.00', 'span 1', 'Within city', '₹'], ['f', 'Zone A: additional 500 g', '28.00', 'span 1', '', '₹'],
      ['f', 'Zone B: first 500 g', '38.00', 'span 1', 'Within state', '₹'], ['f', 'Zone B: additional 500 g', '32.00', 'span 1', '', '₹'],
      ['f', 'Zone C: first 500 g', '46.00', 'span 1', 'Metro to metro', '₹'], ['f', 'Zone C: additional 500 g', '40.00', 'span 1', '', '₹'],
      ['f', 'Zone D: first 500 g', '54.00', 'span 1', 'Rest of India', '₹'], ['f', 'Zone D: additional 500 g', '46.00', 'span 1', '', '₹'],
      ['f', 'Zone E: first 500 g', '68.00', 'span 1', 'Special zones', '₹'], ['f', 'Zone E: additional 500 g', '58.00', 'span 1', '', '₹'],
      ['f', 'COD fee', '2.0% or ₹24.50', 'span 2', 'Whichever is higher'], ['f', 'RTO charge', '75% of forward', 'span 2'],
      ['f', 'Fuel surcharge', 'Included', 'span 2'], ['f', 'GST', '18% on total', 'span 2'],
    ] },
  ], aside: [
    { label: 'Your couriers', rows: [['Delhivery Surface', 'Slab A'], ['Blue Dart Air', 'Slab A'], ['Ekart Surface', 'Slab A'], ['XpressBees Surface', 'Slab B'], ['Ecom Express ROS', 'Slab B']] },
    { label: 'Rate card', body: 'Negotiated on your Growth plan. Slabs are renegotiated at 5,000 shipments per month.', rows: [['Effective', '01 Apr 2026'], ['Next review', '01 Oct 2026'], ['Volume tier', '3,918 / month']] },
  ] },
  invoice: { cols: '1fr 340px', sections: [
    { label: 'Tax invoice NX/26-27/00418', sub: 'NEXGO Logistics Technologies Pvt. Ltd. · 01–31 Aug 2026', cols: '1fr 1fr', fields: [
      ['f', 'Billed to', 'Karma Living Retail Pvt. Ltd.', 'span 1'], ['f', 'GSTIN', '29AABCK4821L1ZP', 'span 1'],
      ['f', 'Invoice date', '01 Sep 2026', 'span 1'], ['f', 'Due date', 'Paid from wallet', 'span 1'],
      ['f', 'Place of supply', 'Karnataka (29)', 'span 1'], ['f', 'Reverse charge', 'No', 'span 1'],
      ['f', 'Freight: 3,918 shipments', '15,92,480.00', 'span 2', 'SAC 996812', '₹'],
      ['f', 'COD collection fees', '1,68,240.00', 'span 2', 'SAC 996819', '₹'],
      ['f', 'Reverse pickup charges', '38,640.00', 'span 2', 'SAC 996812', '₹'],
      ['f', 'Platform subscription: Growth', '2,499.00', 'span 2', 'SAC 998315', '₹'],
      ['f', 'Taxable value', '18,01,859.00', 'span 1', '', '₹'], ['f', 'CGST 9%', '1,62,167.31', 'span 1', '', '₹'],
      ['f', 'SGST 9%', '1,62,167.31', 'span 1', '', '₹'], ['f', 'Invoice total', '21,26,193.62', 'span 1', '', '₹'],
    ], footer: 'Paid in full from wallet on 01 Sep 2026' },
  ], aside: [
    { label: 'Invoice actions', body: 'This invoice is final and has been filed in your GSTR-2B. Download the PDF for your records.', rows: [['Status', 'Paid'], ['Paid on', '01 Sep 2026'], ['Mode', 'Wallet debit']] },
    { label: 'Previous invoices', rows: [['NX/26-27/00418', 'Aug 2026'], ['NX/26-27/00312', 'Jul 2026'], ['NX/26-27/00204', 'Jun 2026'], ['NX/26-27/00108', 'May 2026']] },
  ] },
  shipnow: { cols: '1fr 340px', sections: [
    { label: 'Pickup and delivery', sub: 'Order KL-24817 from Amazon.in', cols: '1fr 1fr', fields: [
      ['f', 'Pickup warehouse', 'Bengaluru, Bommasandra (560068)', 'span 2'],
      ['f', 'Customer name', 'Rohit Menon', 'span 1'], ['f', 'Phone number', '+91 98450 22117', 'span 1'],
      ['f', 'Address line 1', 'Flat 402, Prestige Ferns Residency', 'span 2'],
      ['f', 'Address line 2', 'Harlur Road, HSR Layout Sector 2', 'span 2'],
      ['f', 'Pincode', '560102', 'span 1', 'Serviceable by 7 couriers'], ['f', 'City', 'Bengaluru', 'span 1'],
    ] },
    { label: 'Package and payment', cols: '1fr 1fr 1fr 1fr', fields: [
      ['f', 'Dead weight', '1.80', 'span 1', '', 'kg'], ['f', 'Length', '25', 'span 1', '', 'cm'],
      ['f', 'Breadth', '18', 'span 1', '', 'cm'], ['f', 'Height', '10', 'span 1', '', 'cm'],
      ['f', 'Payment mode', 'Cash on delivery', 'span 2'], ['f', 'COD to collect', '2,480.00', 'span 2', '', '₹'],
      ['f', 'Invoice number', 'KL/26-27/4812', 'span 2'], ['f', 'HSN code', '63041000', 'span 2'],
    ] },
    { label: 'Choose a courier', sub: '7 couriers serve 560068 → 560102 at 2.25 kg', cols: '1fr 1fr', fields: [
      ['f', 'Delhivery Surface 2kg', '₹142.50 · 3–4 Sep · 96.2% delivered', 'span 2', 'Cheapest serviceable courier'],
      ['f', 'Blue Dart Air Express', '₹268.00 · 3 Sep · 97.8% delivered', 'span 2', 'Fastest'],
      ['f', 'Ekart Surface 2.5kg', '₹156.00 · 4–5 Sep · 93.1% delivered', 'span 2'],
      ['f', 'XpressBees Surface 2kg', '₹149.00 · 4–5 Sep · 91.4% delivered', 'span 2'],
      ['f', 'Ecom Express ROS', '₹138.00 · 5–6 Sep · 88.0% delivered', 'span 2', 'Lowest RTO exposure'],
    ], footer: 'Delhivery Surface selected · ₹142.50 will be debited from your wallet' },
  ], aside: [
    { label: 'Chargeable weight', body: 'Volumetric weight 2.25 kg exceeds dead weight 1.80 kg. The 2.50 kg slab will be billed.', rows: [['Dead weight', '1.80 kg'], ['Volumetric', '2.25 kg'], ['Billed slab', '2.50 kg']] },
    { label: 'Charge breakdown', rows: [['Forward charge', '₹118.00'], ['COD collection fee', '₹24.50'], ['GST (18%)', '₹25.65'], ['Total wallet debit', '₹168.15'], ['Wallet after booking', '₹42,808.85']] },
  ] },
  'ship-detail': { cols: '1fr 340px', sections: [
    { label: 'Tracking history', sub: 'AWB 2839471056283 · last synced 6 minutes ago via Delhivery API', cols: '1fr', fields: [
      ['f', '03 Sep, 08:12 AM: Out for delivery', 'HSR Layout delivery hub, Bengaluru · rider Manoj K. (+91 90080 41192)', 'span 1'],
      ['f', '03 Sep, 06:40 AM: Reached destination hub', 'HSR Layout delivery hub, Bengaluru', 'span 1'],
      ['f', '02 Sep, 11:20 PM: In transit', 'Bommasandra sorting centre, Bengaluru', 'span 1'],
      ['f', '02 Sep, 07:05 PM: Shipment picked up', 'Karma Living warehouse, Bengaluru 560068', 'span 1'],
      ['f', '02 Sep, 02:14 PM: Pickup attempt failed', 'Rider reached after warehouse cutoff. Auto-rescheduled to the 7:00 PM slot, no charge applied.', 'span 1'],
      ['f', '02 Sep, 11:48 AM: Manifest generated', 'NEXGO platform · label printed by Anita Rao', 'span 1'],
      ['f', '02 Sep, 11:46 AM: Shipment booked', 'NEXGO platform · wallet debit ₹168.15', 'span 1'],
    ] },
    { label: 'Delivery address', cols: '1fr 1fr', fields: [
      ['f', 'Customer', 'Rohit Menon', 'span 1'], ['f', 'Phone', '+91 98450 22117', 'span 1'],
      ['f', 'Address', 'Flat 402, Prestige Ferns Residency, Harlur Road, HSR Layout Sector 2, Bengaluru, Karnataka 560102', 'span 2'],
    ] },
  ], aside: [
    { label: 'Shipment', rows: [['Order ID', 'KL-24817'], ['Courier', 'Delhivery Surface'], ['Pickup', 'Bommasandra 560068'], ['Chargeable weight', '2.25 kg'], ['Dimensions', '25 × 18 × 10 cm'], ['Freight charged', '₹168.15'], ['Attempts', '1 of 3'], ['Promised', '03 Sep, by 9 PM']] },
    { label: 'COD remittance', body: 'Remittance is initiated 3 days after delivery confirmation. Expected in the 12 Sep payout cycle.', rows: [['COD amount', '₹2,480.00'], ['Status', 'Pending'], ['Payout cycle', '12 Sep']] },
  ] },
};

// id -> [[label, primary(0|1), dest?]]
export const ACTIONS = {
  billing: [['+ Recharge wallet', 1, 'recharges']],
  orders: [['Bulk upload', 0, 'bulk-orders'], ['+ Create order', 1, 'b2c']],
  shipments: [['Download manifest', 0]],
  'ship-detail': [['← All shipments', 0, 'shipments'], ['Print label', 0], ['Raise dispute', 1]],
  shipnow: [['Save as draft', 0], ['Book shipment · ₹142.50', 1]],
  ndr: [['Export CSV', 0], ['Bulk reattempt', 1]],
  weight: [['Export CSV', 0], ['Dispute 29 cases', 1]],
  cod: [['Payout bank account', 0, 'kyc'], ['Billing overview', 0, 'billing']],
  wallet: [['Billing overview', 0, 'billing'], ['+ Recharge', 1, 'recharges']],
  recharges: [['Wallet history', 0, 'wallet'], ['Billing overview', 0, 'billing']],
  invoice: [['Invoice settings', 0, 'inv-settings'], ['Billing overview', 0, 'billing']],
  ratecalc: [['Clear', 0], ['Calculate rates', 1]],
  pincode: [['Bulk check CSV', 0], ['Check pincode', 1]],
  ratecard: [['Download rate card', 0], ['Request renegotiation', 1]],
  mis: [['Manage schedules', 0], ['Generate report', 1]],
  whatsapp: [['Save draft', 0], ['Schedule broadcast', 1]],
  email: [['Save draft', 0], ['Schedule campaign', 1]],
  warehouse: [['+ Add warehouse', 1]],
  kyc: [['Download KYC pack', 0]],
  'courier-rules': [['+ Add rule', 1]],
  webhook: [['Send test event', 0], ['View delivery log', 0]],
  profile: [['Manage team', 0]],
  password: [['Update password', 1]],
  'a-sellers': [['Export CSV', 0], ['+ Add seller', 1]],
  'a-couriers': [['Sync rate cards', 0], ['+ Add courier', 1]],
  'a-cod': [['Export CSV', 0], ['Approve payouts', 1]],
  'a-jobs': [['View schedule', 0], ['Retry failed', 1]],
};

export const RESOLUTIONS = [
  ['Reattempt delivery tomorrow', 'Free', 'Courier retries once between 10 AM and 6 PM. Customer gets an SMS and WhatsApp slot confirmation.'],
  ['Reattempt with a fresh slot from the customer', 'Free', 'Sends a WhatsApp link to pick a two-hour window. Falls back to a standard reattempt after 6 hours of no reply.'],
  ['Change the delivery address', '₹35', 'Address edit is allowed once per shipment and may move the shipment to a different serviceable zone.'],
  ['Return to origin', '₹96', 'Converts to RTO immediately. COD is not collected and the forward charge stays billed.'],
];

export const DRAWER_SCANS = [
  { time: '03 SEP 13:22', title: 'Delivery attempt failed', place: 'Ecom Express · customer unavailable' },
  { time: '03 SEP 08:04', title: 'Out for delivery', place: 'Gachibowli delivery hub, Hyderabad' },
  { time: '02 SEP 21:50', title: 'Reached destination hub', place: 'Gachibowli delivery hub, Hyderabad' },
];

export const WALLET_BALANCE = '₹42,977.00';
