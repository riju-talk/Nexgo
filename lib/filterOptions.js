// Plausible, contextual option lists for the decorative filter buttons on
// table pages — keyed by the filter's own label so every table's filters
// resolve to something real-looking instead of a dead button.
const DATE_RANGES = ['Today', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Custom range'];
const COURIERS = ['All couriers', 'Delhivery', 'Blue Dart', 'Ekart', 'XpressBees', 'Shadowfax'];
const CHANNELS = ['All channels', 'Amazon.in', 'Shopify', 'WooCommerce', 'OpenCart', 'Magento', 'Manual'];
const WAREHOUSES = ['All warehouses', 'Bengaluru, Bommasandra', 'Bengaluru, Peenya Annex', 'Pune, Chakan'];

const MAP = {
  'All channels': CHANNELS,
  'All couriers': COURIERS,
  'All warehouses': WAREHOUSES,
  'All sellers': ['All sellers', 'Karma Living', 'Urban Threads', 'Nashik Naturals', 'Delhi Denim Co.', 'Kochi Spice House', 'Jaipur Blockworks'],
  'All partners': ['All partners', 'Nestasia', 'Pepperfry', 'Tata CLiQ'],
  'All methods': ['All methods', 'NEFT', 'UPI', 'Card', 'Auto-recharge'],
  'Payment mode': ['All', 'COD', 'Prepaid'],
  'Entry type': ['All', 'Debit', 'Credit'],
  'Charge type': ['All', 'Forward', 'RTO'],
  'Attempt count': ['All', '1 of 3', '2 of 3', '3 of 3'],
  'All reasons': ['All reasons', 'Customer unavailable', 'Address incomplete', 'Refused delivery', 'Payment not ready'],
  'Reason': ['All reasons', 'Customer unavailable', 'Address incomplete', 'Refused delivery', 'Payment not ready'],
  'KYC status': ['All', 'Verified', 'Pending', 'Rejected'],
  'Plan': ['All plans', 'Starter', 'Growth', 'Enterprise'],
  'Service type': ['All', 'Surface', 'Air Express', 'Hyperlocal'],
  'Zone coverage': ['All zones', 'Zone A', 'Zone B', 'Zone C', 'Zone D'],
  'Job type': ['All', 'Channel order sync', 'Courier scan pull', 'Manifest generation', 'COD reconciliation', 'Webhook delivery'],
  'Bank': ['All banks', 'HDFC Bank', 'ICICI Bank', 'Axis Bank'],
  'Dispute window': ['All', 'Open', 'Closing in 7 days', 'Closed'],
  'Cycle': ['All cycles', 'This month', 'Last month', 'Last 90 days'],
};

export function optionsFor(label) {
  if (MAP[label]) return MAP[label];
  if (/day|hour|cycle|signup date/i.test(label)) return DATE_RANGES;
  return [label];
}
