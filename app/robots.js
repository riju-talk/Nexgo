import { SITE_URL } from '@/lib/site';

// Only the sign-in / sign-up pages are public. The API, admin panel, printable documents and reset links stay out of search.
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/v1/', '/admin', '/documents/', '/reset-password'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
