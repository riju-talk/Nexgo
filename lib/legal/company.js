// Details the policy documents leave blank. Fill a value in and every policy page shows it instead of the
// highlighted [PLACEHOLDER]. Left empty on purpose: do not guess legal names, addresses or officer details.
export const COMPANY = {
  '[NEXGO LEGAL ENTITY NAME]': 'Nexgo',
  '[REGISTERED OFFICE ADDRESS]': 'Nexgo',
  '[FULL REGISTERED ADDRESS]': '',
  '[PIN CODE]': '',
  '[INDIA]': '',
  '[PRIVACY OFFICER / GRIEVANCE OFFICER NAME]': 'Nexgo',
  '[PRIVACY@NEXGO DOMAIN]': 'nexgo201@gmail.com',
  '[SECURITY@NEXGO DOMAIN]': 'nexgo201@gmail.com',
  '[CITY, STATE, INDIA]': '', // court jurisdiction (API Terms)
  '[CITY, INDIA]': '', // seat of arbitration (API Terms)
  '[DELHI, INDIA]': '', // court jurisdiction + seat of arbitration (Terms)
  '[ONE / THREE]': '', // number of arbitrators (Terms)
};

// The policies shown on the site, in footer order.
export const POLICIES = [
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/cookie-policy', label: 'Cookie Policy' },
  { href: '/refund-policy', label: 'Refund & Cancellation' },
  { href: '/shipping-sop', label: 'Shipping SOP' },
  { href: '/api-terms', label: 'API Terms of Use' },
];
