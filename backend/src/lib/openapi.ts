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

  const page = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>NEXGO demo API</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Source+Sans+3:wght@400;600;700;800&display=swap\">\n<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css\">\n<style>\n:root{--navy:#0a1628;--navy2:#10253e;--edge:#213a55;--accent:#00d7c3;--ink:#17212b;--muted:#647587;--line:#d8e0e7;--paper:#eef2f5;--card:#fff}\n*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:'Source Sans 3',system-ui,sans-serif}\n.hero{background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 62%,#0d3a45 100%);color:#e6eef5;border-bottom:3px solid var(--accent)}\n.wrap{max-width:1180px;margin:0 auto;padding:0 22px}\n.nav{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 0}\n.brand{display:flex;align-items:center;gap:11px;font-weight:800;letter-spacing:.16em;font-size:15px}\n.mark{width:28px;height:28px;background:var(--accent);color:#06212c;display:grid;place-items:center;font-weight:800;font-size:13px;clip-path:polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)}\n.chips{display:flex;gap:8px;flex-wrap:wrap}.chip{padding:5px 11px;border-radius:99px;border:1px solid var(--edge);background:rgba(255,255,255,.05);font-size:12px;font-weight:600;color:#c6d4e3}\n.chip i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:7px;box-shadow:0 0 0 3px rgba(0,215,195,.18)}\nh1{margin:18px 0 8px;font-size:38px;line-height:1.05;letter-spacing:-.035em;font-weight:800}.lead{margin:0 0 26px;max-width:720px;color:#a7b7ce;font-size:16.5px;line-height:1.55}\n.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;padding-bottom:30px}\n.step{background:rgba(255,255,255,.055);border:1px solid var(--edge);border-radius:12px;padding:16px}.step b{display:block;font-size:14.5px;margin-bottom:6px}.step span.n{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#06212c;font-size:12px;font-weight:800;margin-right:8px}\n.step p{margin:0;color:#a7b7ce;font-size:13.5px;line-height:1.5}\n.cred{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:9px;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.28);font:12.5px 'IBM Plex Mono',monospace;color:#d6e2f2}\n.cred button{border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:6px;padding:3px 9px;font:700 11px 'Source Sans 3',sans-serif;cursor:pointer}.cred button:hover{background:var(--accent);color:#06212c}\nmain.wrap{padding-top:26px;padding-bottom:60px}\n.swagger-ui{font-family:'Source Sans 3',sans-serif}.swagger-ui .topbar{display:none}.swagger-ui .info{margin:0 0 18px}.swagger-ui .info .title{font-weight:800;letter-spacing:-.02em;color:var(--ink)}\n.swagger-ui .scheme-container{box-shadow:none;background:transparent;padding:0}\n.swagger-ui .opblock-tag{border:1px solid var(--line);border-radius:12px;background:var(--card);margin:0 0 10px;padding:12px 16px;font-weight:700;color:var(--ink)}\n.swagger-ui .opblock-tag:hover{background:#f6f8fa;border-color:var(--accent)}\n.swagger-ui .opblock{border-radius:10px;border-width:1px;box-shadow:none;margin:0 0 8px}\n.swagger-ui .opblock .opblock-summary-method{border-radius:6px;font-family:'IBM Plex Mono',monospace;font-size:12px;min-width:68px}\n.swagger-ui .opblock.opblock-get{background:rgba(0,215,195,.06);border-color:#00b3a3}.swagger-ui .opblock.opblock-get .opblock-summary-method{background:#00a99c}\n.swagger-ui .opblock.opblock-post{background:rgba(36,84,214,.06);border-color:#2454d6}.swagger-ui .opblock.opblock-post .opblock-summary-method{background:#2454d6}\n.swagger-ui .opblock.opblock-put,.swagger-ui .opblock.opblock-patch{background:rgba(245,130,32,.07);border-color:#f58220}.swagger-ui .opblock.opblock-put .opblock-summary-method,.swagger-ui .opblock.opblock-patch .opblock-summary-method{background:#f58220}\n.swagger-ui .opblock.opblock-delete{background:rgba(178,58,43,.06);border-color:#b23a2b}.swagger-ui .opblock.opblock-delete .opblock-summary-method{background:#b23a2b}\n.swagger-ui .opblock-summary-path{font-family:'IBM Plex Mono',monospace;font-size:13.5px}\n.swagger-ui .btn.execute{background:var(--navy);border-color:var(--navy);border-radius:8px}.swagger-ui .btn.execute:hover{background:var(--navy2)}\n.swagger-ui .btn.try-out__btn{border-radius:8px;border-color:var(--navy);color:var(--navy)}\n.swagger-ui input[type=text],.swagger-ui textarea{border-radius:8px}\n.swagger-ui .filter .operation-filter-input{border-radius:10px;border:1px solid var(--line);padding:10px 12px;margin:0 0 14px;width:100%}\nfooter{padding:22px;text-align:center;color:var(--muted);font-size:12.5px}\n@media(max-width:640px){h1{font-size:28px}}\n</style></head>\n<body>\n<header class=\"hero\"><div class=\"wrap\">\n  <div class=\"nav\"><div class=\"brand\"><span class=\"mark\">N</span>NEXGO <span style=\"font-weight:600;letter-spacing:.04em;color:#8fa3bd;margin-left:4px\">API</span></div>\n    <div class=\"chips\"><span class=\"chip\"><i></i>Demo online</span><span class=\"chip\">REST \u00b7 JSON</span><span class=\"chip\">v1</span><span class=\"chip\">Test data only</span></div></div>\n  <h1>Ship smarter. Build on NEXGO.</h1>\n  <p class=\"lead\">The demo REST API behind the NEXGO shipping console: orders, courier rates, serviceability, NDR, weight disputes, wallet and reports. Everything below runs live against the demo database.</p>\n  <div class=\"steps\">\n    <div class=\"step\"><b><span class=\"n\">1</span>Sign in</b><p>Open <code>POST /v1/auth/login</code>, press <em>Try it out</em> then <em>Execute</em>. The session cookie is stored for you.</p>\n      <div class=\"cred\"><span>demo@acmeexports.com \u00b7 Demo@123</span><button data-copy=\"demo@acmeexports.com\">copy</button></div></div>\n    <div class=\"step\"><b><span class=\"n\">2</span>Call any endpoint</b><p>Seller endpoints work straight away. Mutations send the CSRF token automatically.</p></div>\n    <div class=\"step\"><b><span class=\"n\">3</span>Admin area</b><p>Use <code>POST /v1/admin/auth/login</code> for the platform-admin endpoints.</p>\n      <div class=\"cred\"><span>admin@nexgo.in \u00b7 Admin@456</span><button data-copy=\"admin@nexgo.in\">copy</button></div></div>\n  </div>\n</div></header>\n<main class=\"wrap\"><div id=\"ui\"></div></main>\n<footer>NEXGO demo API \u00b7 responses are test data \u00b7 <a href=\"/openapi.json\" style=\"color:#2454d6\">openapi.json</a> \u00b7 <a href=\"/health\" style=\"color:#2454d6\">health</a></footer>\n<script src=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js\"></script>\n<script>\nwindow.ui = SwaggerUIBundle({\n  url: '/openapi.json', dom_id: '#ui', deepLinking: true, docExpansion: 'none', tagsSorter: 'alpha', filter: true, tryItOutEnabled: true, defaultModelsExpandDepth: -1,\n  requestInterceptor: function (req) {\n    req.credentials = 'include';\n    var m = document.cookie.match(/(?:^|; )nx_csrf=([^;]*)/);\n    if (m && req.method !== 'GET') req.headers['x-csrf-token'] = decodeURIComponent(m[1]);\n    return req;\n  }\n});\ndocument.addEventListener('click', function (e) { var b = e.target.closest('[data-copy]'); if (b && navigator.clipboard) { navigator.clipboard.writeText(b.getAttribute('data-copy')); b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1200); } });\n</script></body></html>";

  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(page));
  app.get('/docs', async (_request, reply) => reply.type('text/html; charset=utf-8').send(page));
  app.get('/openapi.json', async () => buildSpec());
}
