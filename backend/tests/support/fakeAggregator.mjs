// A fake courier aggregator for end-to-end tests: speaks the few endpoints the Lorrigo adapter uses, with a fixed delay per call and switchable behaviour.
//   mode.nobalance   POST /shipments answers "Insufficient balance"
//   mode.maxInflight more calls than this at once answer HTTP 429 (Retry-After: 1)
//   mode.postAwb     POST /shipments carries the AWB and shipment id in its answer (false: they must be read back with GET /orders/:id)
// Every call is counted in `stats`, so a test can prove how many calls a booking really made.
import http from 'node:http';

const RUN = Date.now().toString(36).toUpperCase();
export function startFakeAggregator({ port = 4555, latencyMs = 300, courierIds = [] } = {}) {
  const mode = { nobalance: false, maxInflight: 0, postAwb: true, latencyMs };
  const stats = { calls: {}, peak: 0, tooMany: 0, ordersCreated: 0, shipmentsBooked: 0, cancels: 0, duplicateOrderRefusals: 0 };
  const orders = new Map(); // id -> { id, ref, shipment: null | { id, awb }, cancelled }
  const byRef = new Map();
  const hubs = new Map(); // facilityName -> { id, name }
  let inflight = 0; let seq = 0;

  const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } }); });
  const count = (key) => { stats.calls[key] = (stats.calls[key] || 0) + 1; };

  const server = http.createServer(async (req, res) => {
    inflight += 1; stats.peak = Math.max(stats.peak, inflight);
    try {
      const url = new URL(req.url, 'http://x'); const path = url.pathname; const method = req.method;
      const body = method === 'POST' ? await readBody(req) : {};
      if (mode.maxInflight && inflight > mode.maxInflight) { stats.tooMany += 1; return send(res, 429, { message: 'Too many requests' }, { 'retry-after': '1' }); }
      await new Promise((r) => setTimeout(r, mode.latencyMs));
      if (method === 'GET' && path === '/pickup-address') { count('GET /pickup-address'); return send(res, 200, { hubs: [...hubs.values()].map((h) => ({ id: h.id, name: h.name, is_active: true })), hasNextPage: false }); }
      if (method === 'POST' && path === '/pickup-address') {
        count('POST /pickup-address');
        if (hubs.has(body.facilityName)) return send(res, 400, { message: 'Pickup address already exists' });
        const h = { id: `hub_${++seq}`, name: body.facilityName }; hubs.set(h.name, h); return send(res, 200, { id: h.id });
      }
      if (method === 'POST' && path === '/orders') {
        count('POST /orders');
        if (byRef.has(body.orderId)) { stats.duplicateOrderRefusals += 1; return send(res, 400, { message: 'Order Id already exists. Please try with another Order Id.' }); }
        const id = `ord_${++seq}`; const o = { id, ref: body.orderId, shipment: null, cancelled: false }; orders.set(id, o); byRef.set(o.ref, o); stats.ordersCreated += 1;
        return send(res, 200, { id });
      }
      if (method === 'GET' && path === '/orders') { count('GET /orders'); return send(res, 200, { orders: [...orders.values()].map((o) => ({ id: o.id, orderNumber: o.ref, shipment: o.shipment })), hasMore: false }); }
      const one = path.match(/^\/orders\/([^/]+)$/);
      if (method === 'GET' && one) { count('GET /orders/:id'); const o = orders.get(one[1]); return o ? send(res, 200, { id: o.id, orderNumber: o.ref, shipment: o.shipment }) : send(res, 404, { message: 'Not found' }); }
      const rates = path.match(/^\/shipments\/([^/]+)\/rates$/);
      if (method === 'GET' && rates) { count('GET /shipments/:id/rates'); return send(res, 200, { rates: courierIds.map((id) => ({ id, total_price: 50 })) }); }
      if (method === 'POST' && path === '/shipments') {
        count('POST /shipments');
        if (mode.nobalance) return send(res, 400, { message: 'Insufficient balance. Please recharge your wallet to continue.' });
        const o = orders.get(body.order_id); if (!o) return send(res, 404, { message: 'Order not found' });
        if (!o.shipment) { o.shipment = { id: `shp_${++seq}`, awb: `FK${RUN}${String(seq).padStart(6, "0")}` }; stats.shipmentsBooked += 1; }
        return send(res, 200, mode.postAwb ? { success: true, shipment: o.shipment } : { success: true });
      }
      const cancel = path.match(/^\/shipments\/([^/]+)\/cancel$/);
      if (method === 'POST' && cancel) { count('POST /shipments/:id/cancel'); stats.cancels += 1; return send(res, 200, { success: true }); }
      send(res, 404, { message: 'Unknown endpoint ' + method + ' ' + path });
    } catch (e) { send(res, 500, { message: String(e) }); } finally { inflight -= 1; }
  });
  server.listen(port);
  return { server, mode, stats, orders, close: () => server.close() };
}
