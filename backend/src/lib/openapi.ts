import type { FastifyInstance } from 'fastify';

// Self-contained API explorer: the OpenAPI document is built from the route table Fastify actually
// registered (so it can never drift), and Swagger UI is loaded from a CDN. No extra dependency.
type RouteInfo = { method: string; url: string };

const PUBLIC = [/^\/$/, /^\/docs$/, /^\/openapi\.json$/, /^\/health$/, /^\/ready$/, /^\/v1\/auth\/(login|signup|forgot-password|reset-password)$/, /^\/v1\/admin\/auth\/(login|mfa)$/, /^\/v1\/locations\//, /^\/v1\/webhooks\//, /^\/v1\/team\/invitations\/accept$/];

const SUMMARIES: Record<string, string> = {
  'POST /v1/auth/login': 'Sign in as a seller (sets the session cookie)',
  'POST /v1/admin/auth/login': 'Sign in as a platform admin',
  'GET /v1/locations/pincode/{pincode}': 'Pincode → city, state, zone, COD and delivery-area flags',
  'POST /v1/shipping/quotes': 'Compare courier rates, delivery windows and COD fees for a parcel',
  'POST /v1/shipping/serviceability': 'Check every courier for a pickup → delivery pincode lane',
  'POST /v1/shipments/book': 'Book a courier for a ready-to-ship order (needs an Idempotency-Key header)',
  'POST /v1/orders': 'Create an order (maximum 5 products)',
  'GET /v1/ndr/cases': 'NDR board: tabs, search, filters and pagination',
  'GET /v1/ndr/stats': 'NDR overview counts, reason mix and courier filter options',
  'POST /v1/reports': 'Generate a CSV report',
  'GET /v1/warehouses': 'List warehouses',
  'POST /v1/warehouses': 'Add a warehouse',
};

const EXAMPLES: Record<string, unknown> = {
  'POST /v1/auth/login': { email: 'demo@acmeexports.com', password: 'Demo@123' },
  'POST /v1/admin/auth/login': { email: 'admin@nexgo.in', password: 'Admin@456' },
  'POST /v1/shipping/quotes': { destinationPincode: '560001', pickupPincode: '110001', weightG: 1200, paymentMode: 'prepaid', lengthMm: 200, widthMm: 150, heightMm: 100 },
  'POST /v1/shipping/serviceability': { pickupPincode: '110001', deliveryPincode: '560001', weightG: 1200 },
  'POST /v1/reports': { type: 'shipments', from: '2026-09-01', to: '2026-10-08' },
  'POST /v1/warehouses': { name: 'Delhi Central Warehouse', warehouseType: 'primary', contactName: 'Rohit Sharma', phone: '+919876543210', email: 'rohit@example.com', addressLine1: 'Plot 123, Sector 18, Industrial Area', city: 'New Delhi', state: 'Delhi', pincode: '110001', latitude: 28.6139, longitude: 77.209, capacitySqft: 5000, opensAt: '09:00', closesAt: '18:00', isDefault: false },
  'POST /v1/ndr/cases/{caseId}/resolve': { resolutionAction: 'reattempt', resolutionNotes: 'Customer confirmed availability', scheduledDeliveryDate: '2026-10-12T10:00:00.000Z' },
  'POST /v1/wallet/recharge': { amountPaise: 50000 },
  'POST /v1/tickets': { subject: 'Pickup missed', category: 'Operations', message: 'The pickup did not arrive today', priority: 'normal' },
};

const toOpenApiPath = (url: string) => url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
const tagFor = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'v1') return 'Service';
  const admin = parts[1] === 'admin';
  const area = (admin ? parts[2] : parts[1]) ?? 'misc';
  return `${admin ? 'Admin · ' : ''}${area.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}`;
};

export function registerDocs(app: FastifyInstance) {
  const routes: RouteInfo[] = [];
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) if (!['HEAD', 'OPTIONS'].includes(method)) routes.push({ method, url: route.url });
  });

  const buildSpec = () => {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const { method, url } of routes) {
      const path = toOpenApiPath(url);
      if (path === '/' || path === '/docs' || path === '/openapi.json') continue;
      const m = method.toLowerCase(); const key = `${method} ${path}`;
      const isPublic = PUBLIC.some((re) => re.test(path));
      const mutating = ['post', 'put', 'patch', 'delete'].includes(m);
      const parameters: unknown[] = [...(path.match(/\{(\w+)\}/g) ?? []).map((p) => ({ name: p.slice(1, -1), in: 'path', required: true, schema: { type: 'string' } }))];
      if (path === '/v1/shipments/book') parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 16 }, example: 'book-order-0001-abcdef' });
      (paths[path] ??= {})[m] = {
        tags: [tagFor(path)],
        summary: SUMMARIES[key] ?? `${method} ${path}`,
        description: isPublic ? 'Public endpoint.' : path.startsWith('/v1/admin') ? 'Requires a platform-admin session. Sign in with `POST /v1/admin/auth/login` first.' : 'Requires a seller session. Sign in with `POST /v1/auth/login` first; the session cookie is sent automatically.',
        parameters,
        ...(mutating ? { requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' }, ...(EXAMPLES[key] ? { example: EXAMPLES[key] } : {}) } } } } : {}),
        responses: { 200: { description: 'Success' }, 400: { description: 'Validation error' }, 401: { description: 'Not signed in' }, 403: { description: 'Forbidden or missing CSRF token' } },
      };
    }
    return {
      openapi: '3.0.3',
      info: { title: 'NEXGO demo API', version: '1.0.0', description: 'Demo API for the NEXGO multi-courier shipping platform. **Try it:** run `POST /v1/auth/login` with the pre-filled demo seller, then call any seller endpoint. Admin endpoints need `POST /v1/admin/auth/login`. All data is test data.' },
      servers: [{ url: '/' }],
      tags: [...new Set(Object.values(paths).flatMap((p) => Object.values(p).map((o) => (o as { tags: string[] }).tags[0])))].sort().map((name) => ({ name })),
      paths,
    };
  };

  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXGO demo API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"><style>body{margin:0;background:#fff}.topbar-note{padding:14px 20px;background:#0b1a2e;color:#e6eef5;font:14px system-ui,sans-serif}.topbar-note b{color:#00d7c3}</style></head>
<body><div class="topbar-note"><b>NEXGO demo API</b> · test data only · sign in with <code>POST /v1/auth/login</code> (pre-filled), then try any endpoint.</div><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
window.ui = SwaggerUIBundle({
  url: '/openapi.json', dom_id: '#ui', deepLinking: true, docExpansion: 'none', tagsSorter: 'alpha', filter: true, tryItOutEnabled: true,
  requestInterceptor: function (req) {
    req.credentials = 'include';
    var m = document.cookie.match(/(?:^|; )nx_csrf=([^;]*)/);
    if (m && req.method !== 'GET') req.headers['x-csrf-token'] = decodeURIComponent(m[1]);
    return req;
  }
});
</script></body></html>`;

  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(page));
  app.get('/docs', async (_request, reply) => reply.type('text/html; charset=utf-8').send(page));
  app.get('/openapi.json', async () => buildSpec());
}
