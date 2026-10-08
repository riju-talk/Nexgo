/** @type {import('next').NextConfig} */
// BACKEND_URL (server-side only) is the deployed API origin, e.g. https://nexgo-api.vercel.app.
// When set, /v1/* is proxied to it so the browser only ever talks to this origin.
// Demo deploy: any production build (Vercel runs `next build`) proxies /v1/* to the deployed demo API, so no
// environment variable is needed. `next dev` leaves it unset and talks to localhost:4010 directly.
const DEMO_API = 'https://nexgo-zpcx.vercel.app';
const backend = (process.env.BACKEND_URL ?? (process.env.NODE_ENV === 'production' ? DEMO_API : undefined))?.replace(/\/$/, '');

const nextConfig = {
  // A proxied build talks to its own origin; otherwise honour NEXT_PUBLIC_API_BASE (local dev default is set in lib/api.js).
  env: backend ? { NEXT_PUBLIC_API_BASE: '' } : {},
  async rewrites() {
    return backend ? [{ source: '/v1/:path*', destination: `${backend}/v1/:path*` }] : [];
  },
};

export default nextConfig;
