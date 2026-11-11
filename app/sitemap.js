import { SITE_URL } from '@/lib/site';

export default function sitemap() {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/login`, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/signup`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/track`, lastModified, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/privacy-policy`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/cookie-policy`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/refund-policy`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/shipping-sop`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/api-terms`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
  ];
}
