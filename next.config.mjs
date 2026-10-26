/** @type {import('next').NextConfig} */
// How the browser reaches the API (decided at BUILD time, `next build` bakes it in):
//   BACKEND_URL            -> /v1/* is proxied server-side to that origin, so the session and CSRF cookies stay
//                             first-party on this site (docker compose, single-container setups).
//   NEXT_PUBLIC_API_BASE   -> the browser calls that origin directly. Set it to an empty string when a load balancer
//                             (AWS ALB / CloudFront) already routes /v1/* to the backend on the same domain.
//   neither                -> `next dev` talks to http://localhost:4010; a production build refuses to continue.
const backend = process.env.BACKEND_URL?.replace(/\/$/, '') || undefined;
if (process.env.NODE_ENV === 'production' && !backend && process.env.NEXT_PUBLIC_API_BASE === undefined) {
  throw new Error('Set BACKEND_URL (proxy /v1/* to the API) or NEXT_PUBLIC_API_BASE (empty string if the load balancer routes /v1/*) before building for production.');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' }] : []),
];

const nextConfig = {
  output: 'standalone', // minimal self-contained server for the docker image
  poweredByHeader: false,
  // A proxied build talks to its own origin; otherwise honour NEXT_PUBLIC_API_BASE (local dev default is set in lib/api.js).
  env: backend ? { NEXT_PUBLIC_API_BASE: '' } : {},
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return backend ? [{ source: '/v1/:path*', destination: `${backend}/v1/:path*` }] : [];
  },
};

export default nextConfig;
