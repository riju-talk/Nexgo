import { SITE_URL } from '@/lib/site';

// The landing page, sign-in / sign-up, policy pages and the tracking form are public. The API, the signed-in console, admin panel, printable documents,
// single-parcel tracking results and reset links stay out of search.
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/v1/', '/admin', '/documents/', '/reset-password', '/forgot-password', '/track/', '/dashboard', '/orders', '/shipments', '/ndr', '/weight-discrepancies', '/billing', '/finance', '/reports', '/mis', '/channels', '/integrations', '/marketing', '/settings', '/support', '/tools', '/notifications'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
