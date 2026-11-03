import { SITE_URL } from '@/lib/site';

export default function sitemap() {
  return [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/login`, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/signup`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/privacy-policy`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/cookie-policy`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/refund-policy`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/shipping-sop`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/api-terms`, changeFrequency: 'yearly', priority: 0.4 },
  ];
}
