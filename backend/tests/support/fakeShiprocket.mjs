// A fake Shiprocket for end-to-end tests: speaks the endpoints the Shiprocket adapter uses (login, pickup locations, create order, serviceability,
// assign AWB, generate pickup, cancel, wallet balance, tracking, order lookup) with a fixed delay per call and switchable behaviour.
//   mode.nobalance   POST /courier/assign/awb answers "Insufficient wallet balance"
//   mode.balance     what GET /account/details/wallet-balance reports (rupees)
//   mode.tracking    the tracking_data returned for any AWB (set per test)
// Every call is counted in `stats.calls`, so a test can prove how many calls a booking really made.
import http from 'node:http';

const RUN = Date.now().toString(36).toUpperCase();
export function startFakeShiprocket({ port = 4666, latencyMs = 100, courierIds = [10], email = 'api@test.example', password = 'pw' } = {}) {
  const mode = { nobalance: false, balance: 5000, tracking: null, latencyMs };
  const stats = { calls: {}, ordersCreated: 0, shipmentsBooked: 0, cancels: [], pickupsRequested: 0, lastOrderBody: null, assignBodies: [] };
  const pickups = new Map(); const orders = new Map(); // id -> { id, shipmentId, ref, awb }
  let seq = 1000;
  const count = (k) => { stats.calls[k] = (stats.calls[k] || 0) + 1; };
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } }); });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x'); const path = url.pathname.replace('/v1/external', ''); const method = req.method;
      const body = method === 'POST' ? await readBody(req) : {};
      await new Promise((r) => setTimeout(r, mode.latencyMs));
      if (method === 'POST' && path === '/auth/login') {
        count('POST /auth/login');
        return body.email === email && body.password === password ? send(res, 200, { token: 'fake-token-' + RUN }) : send(res, 403, { message: 'Invalid email or password' });
      }
      if (req.headers.authorization !== 'Bearer fake-token-' + RUN) return send(res, 401, { message: 'Unauthenticated.' });
      if (method === 'GET' && path === '/settings/company/pickup') { count('GET /settings/company/pickup'); return send(res, 200, { data: { shipping_address: [...pickups.values()] } }); }
      if (method === 'POST' && path === '/settings/company/addpickup') {
        count('POST /settings/company/addpickup');
        if (pickups.has(body.pickup_location)) return send(res, 422, { message: 'Pickup location already exists' });
        pickups.set(body.pickup_location, { pickup_location: body.pickup_location, pin_code: body.pin_code }); return send(res, 200, { success: true });
      }
      if (method === 'POST' && path === '/orders/create/adhoc') {
        count('POST /orders/create/adhoc'); stats.lastOrderBody = body;
        if (!pickups.has(body.pickup_location)) return send(res, 422, { message: 'Wrong Pickup location entered. Please use one of the following: ' + [...pickups.keys()].join(', ') });
        if (!/^\d{6}$/.test(String(body.billing_pincode)) || !['COD', 'Prepaid'].includes(body.payment_method)) return send(res, 422, { message: 'The given data was invalid.', errors: { billing_pincode: ['invalid'] } });
        const id = ++seq; const shipmentId = ++seq; orders.set(String(id), { id, shipmentId, ref: body.order_id, awb: null }); stats.ordersCreated += 1;
        return send(res, 200, { order_id: id, shipment_id: shipmentId, status: 'NEW', status_code: 1, awb_code: '', courier_company_id: '', courier_name: '' });
      }
      if (method === 'GET' && path === '/courier/courierListWithCounts') { // shaped like the live answer: status 0 on real domestic couriers, service_type 1 domestic / 0 international / 2 reverse, mode 1 = air
        count('GET /courier/courierListWithCounts');
        return send(res, 200, { courier_data: [{ id: 900, name: 'Blue Dart Air', status: 0, mode: 1, service_type: 1, is_hyperlocal: 0 }, { id: 901, name: 'Aramex Worldwide', status: 1, mode: 1, service_type: 0, is_hyperlocal: 0 }, { id: 902, name: 'Delhivery Back Surface', status: 0, mode: 0, service_type: 2, is_hyperlocal: 0 }], total_courier_count: 3 });
      }
      if (method === 'GET' && path === '/courier/serviceability/') {
        count('GET /courier/serviceability/');
        return send(res, 200, { data: { available_courier_companies: courierIds.map((id) => ({ courier_company_id: id, courier_name: 'Fake Courier ' + id, rate: 60, etd: '3 days' })) } });
      }
      if (method === 'POST' && path === '/courier/assign/awb') {
        count('POST /courier/assign/awb'); stats.assignBodies.push(body);
        if (mode.nobalance) return send(res, 422, { message: 'Insufficient wallet balance. Please recharge your wallet.' });
        const o = [...orders.values()].find((x) => String(x.shipmentId) === String(body.shipment_id)); if (!o) return send(res, 404, { message: 'Shipment not found' });
        if (!o.awb) { o.awb = `SRF${RUN}${String(o.shipmentId).padStart(6, '0')}`; stats.shipmentsBooked += 1; }
        return send(res, 200, { awb_assign_status: 1, response: { data: { awb_code: o.awb, courier_name: 'Fake Courier', shipment_id: o.shipmentId, order_id: o.id } } });
      }
      if (method === 'POST' && path === '/courier/generate/pickup') { count('POST /courier/generate/pickup'); stats.pickupsRequested += 1; return send(res, 200, { pickup_status: 1 }); }
      if (method === 'POST' && path === '/orders/cancel') {
        count('POST /orders/cancel'); stats.cancels.push(...(body.ids || []));
        const bad = (body.ids || []).find((i) => !orders.has(String(i))); if (bad !== undefined) return send(res, 404, { message: 'Order not found' });
        return send(res, 200, { message: 'Order cancelled successfully' });
      }
      const show = path.match(/^\/orders\/show\/(\d+)$/);
      if (method === 'GET' && show) { count('GET /orders/show'); const o = orders.get(show[1]); return o ? send(res, 200, { data: { id: o.id, shipments: o.awb ? { awb: o.awb } : {} } }) : send(res, 404, { message: 'Order not found' }); }
      if (method === 'GET' && path === '/account/details/wallet-balance') { count('GET /account/details/wallet-balance'); return send(res, 200, { data: { balance_amount: String(mode.balance) } }); }
      const track = path.match(/^\/courier\/track\/awb\/(.+)$/);
      if (method === 'GET' && track) { count('GET /courier/track/awb'); return send(res, 200, mode.tracking ? { tracking_data: mode.tracking } : { tracking_data: { track_status: 0, error: 'no data' } }); }
      send(res, 404, { message: 'Unknown endpoint ' + method + ' ' + path });
    } catch (e) { send(res, 500, { message: String(e) }); }
  });
  server.listen(port);
  return { server, mode, stats, orders, pickups, close: () => server.close() };
}
