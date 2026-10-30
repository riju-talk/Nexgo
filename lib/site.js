// Public identity of the site, shared by the metadata, robots.txt and sitemap.
// NEXT_PUBLIC_SITE_URL is only needed if the domain changes; it is read at build time.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mynexgo.com').replace(/\/$/, '');
export const SITE_NAME = 'NEXGO';
export const SITE_TITLE = 'NEXGO: Multi-courier shipping platform for Indian sellers';
export const SITE_DESCRIPTION =
  'Compare live courier rates, book shipments, track deliveries and manage NDR, RTO and COD remittance in one shipping console built for Indian e-commerce sellers.';
