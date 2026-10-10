// Screen id <-> real URL path, so Next.js routing replaces the prototype's
// internal `screen` state string. Ids match the keys used in lib/data.js.
export const PATHS = {
  login: '/login',
  signup: '/signup',
  forgot: '/forgot-password',
  reset: '/reset-password',

  dashboard: '/dashboard',

  orders: '/orders',
  'bulk-orders': '/orders/bulk',
  b2c: '/orders/b2c',
  b2b: '/orders/b2b',
  reverse: '/orders/reverse',
  dropship: '/orders/dropshipping',
  shipnow: '/orders/ship-now',

  ratecalc: '/tools/rate-calculator',
  ratecard: '/tools/rate-card',
  pincode: '/tools/pincode-serviceability',

  shipments: '/shipments',
  'ship-detail': '/shipments/detail',

  ndr: '/ndr',
  weight: '/weight-discrepancies',
  rto: '/reports/rto-dashboard',

  mis: '/mis',

  billing: '/billing',
  cod: '/finance/cod-reconciliation',
  charges: '/finance/shipping-charges',
  recharges: '/finance/recharges',
  wallet: '/finance/wallet-history',
  invoice: '/finance/invoice',
  'credit-note': '/finance/credit-note',
  tds: '/finance/tds',

  whatsapp: '/marketing/whatsapp',
  email: '/marketing/email',

  amazon: '/channels/amazon',
  shopify: '/channels/shopify',
  woo: '/channels/woocommerce',
  opencart: '/channels/opencart',
  magento: '/channels/magento',

  'wa-api': '/integrations/whatsapp-api',
  'sms-api': '/integrations/sms-api',
  abandoned: '/integrations/abandoned-checkouts',

  warehouse: '/settings/warehouse',
  'account-config': '/settings/account-configuration',
  kyc: '/settings/kyc',
  'courier-rules': '/settings/courier-rules',
  label: '/settings/label',
  'inv-settings': '/settings/invoice-settings',
  printer: '/settings/printer',
  webhook: '/settings/webhook',
  notifications: '/settings/notifications',
  profile: '/settings/profile',
  team: '/settings/team',
  support: '/support/tickets',
  'email-reports': '/settings/email-reports',
  password: '/settings/change-password',

  'a-overview': '/admin/overview',
  'a-sellers': '/admin/sellers',
  'a-orders': '/admin/orders',
  'a-shipments': '/admin/shipments',
  'a-couriers': '/admin/couriers',
  'a-zones': '/admin/couriers/zones',
  'a-sla': '/admin/couriers/sla',
  'a-performance': '/admin/couriers/performance',
  'a-kyc': '/admin/kyc-verification',
  'a-wallets': '/admin/wallets',
  'a-credit': '/admin/credit-limits',
  'a-rto': '/admin/rto',
  'a-pickups': '/admin/pickups',
  'a-invoices': '/admin/invoices',
  'a-notes': '/admin/credit-notes-tds',
  'a-gst': '/admin/gst-reports',
  'a-revenue': '/admin/revenue',
  'a-sla-report': '/admin/sla-report',
  'a-analytics': '/admin/courier-analytics',
  'a-tickets': '/admin/tickets',
  'a-live-chat': '/admin/live-chat',
  'a-escalations': '/admin/escalations',
  'a-disputes': '/admin/courier-disputes',
  'a-system': '/admin/system-settings',
  'a-api': '/admin/api-management',
  'a-audit': '/admin/audit-logs',
  'a-roles': '/admin/role-permissions',
  'a-login': '/admin/login',
  'a-ndr': '/admin/ndr',
  'a-cod': '/admin/cod',
  'a-jobs': '/admin/jobs',
};

export const IDS_BY_PATH = Object.fromEntries(Object.entries(PATHS).map(([id, path]) => [path, id]));

export function pathFor(id) {
  return PATHS[id] || '/dashboard';
}

export const ADMIN_SECTION_IDS = {
  orders: 'a-orders',
  'kyc-verification': 'a-kyc', wallets: 'a-wallets', 'credit-limits': 'a-credit', rto: 'a-rto', pickups: 'a-pickups',
  invoices: 'a-invoices', 'credit-notes-tds': 'a-notes', 'gst-reports': 'a-gst', revenue: 'a-revenue', 'sla-report': 'a-sla-report', 'courier-analytics': 'a-analytics',
  tickets: 'a-tickets', 'live-chat': 'a-live-chat', escalations: 'a-escalations', 'courier-disputes': 'a-disputes',
  'system-settings': 'a-system', 'api-management': 'a-api', 'audit-logs': 'a-audit', 'role-permissions': 'a-roles',
};

export function idForPath(pathname) {
  return IDS_BY_PATH[pathname] || 'dashboard';
}
