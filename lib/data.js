// Page titles and the form / connector layouts of the settings screens. Live figures never come from this file.


// id -> [crumb, title, sub?]
export const PAGES = {
  dashboard: ['Exceptions', 'Dashboard'],
  'notif-center': ['Account', 'Notifications', 'Updates about your parcels, wallet and account'],
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
  manifests: ['Track', 'Pickup & Manifests', 'The pickup lists couriers sign when they collect your parcels'],
  'bulk-track': ['Track', 'Bulk AWB tracking', 'Check up to 500 shipments at once by pasting AWBs or uploading a sheet'],
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
  notifications: ['ABC configuration', 'COD Order Confirmation', 'IVR call asking COD customers to confirm or cancel'],
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
  'a-integrations': ['Admin', 'Integrations', 'Courier aggregators, their API keys and webhooks'],
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
  'a-escalations': ['Admin', 'Escalations', 'Time-sensitive operational issues and ownership'],
  'a-disputes': ['Admin', 'Weight Disputes', 'Review seller weight disputes and record the courier decision'],
  'a-rate-cards': ['Admin', 'Rate Cards', 'Assign courier rates to sellers and review the rate card each seller has'],
  'a-rate-view': ['Admin', 'Rate Card', 'The rates a seller is charged, by courier, weight slab and zone'],
  'a-rate-assign': ['Admin', 'Assign Courier & Rates', 'Choose the couriers a seller can book and set their rates'],
  'a-seller-profile': ['Admin', 'Seller Profile', 'Account, wallet, rate card, pincode access and performance for one seller'],
  'a-notes': ['Admin', 'Credit Notes & TDS', 'Issue credit notes and record TDS entries that sellers see in Billing'],
  'a-system': ['Admin', 'System Status', 'Queues, storage and database health'],
  'a-audit': ['Admin', 'Audit Logs', 'Immutable record of administrative activity'],
  'a-roles': ['Admin', 'Role Permissions', 'Control platform access and approvals'],
  'a-ndr': ['Admin', 'NDR', 'Platform-wide non-delivery exposure'],
  'a-cod': ['Admin', 'COD', 'Collection and remittance across all sellers'],
  'a-jobs': ['Admin', 'Jobs', 'Sync, manifest and reconciliation job runs'],
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


