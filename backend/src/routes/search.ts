import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { hasPermission, maskCustomerRows } from '../lib/permissions.js';
import { requireSeller } from './seller.js';

// The top-bar search. One box, many kinds of number: "awb:LS123", "order:#1042", "9876543210", "411001", "status:ndr", "inv:NX/26-27/00418" ...
// A known prefix (word + colon) picks the kind explicitly; otherwise the shape of the text decides, and anything else is searched everywhere.
export type Kind = 'awb' | 'order' | 'nx' | 'phone' | 'pin' | 'name' | 'email' | 'invoice' | 'ticket' | 'payment' | 'cod' | 'status' | 'courier' | 'tag' | 'warehouse' | 'any';

const PREFIX: Record<string, Kind> = {
  awb: 'awb', waybill: 'awb', lr: 'awb', tracking: 'awb',
  order: 'order', ord: 'order', o: 'order', oid: 'order', ref: 'order',
  nx: 'nx', nexgo: 'nx',
  phone: 'phone', mob: 'phone', mobile: 'phone', ph: 'phone', tel: 'phone',
  pin: 'pin', pincode: 'pin', zip: 'pin',
  name: 'name', cust: 'name', customer: 'name',
  email: 'email', mail: 'email',
  inv: 'invoice', invoice: 'invoice', bill: 'invoice',
  ticket: 'ticket', tkt: 'ticket', support: 'ticket',
  pay: 'payment', payment: 'payment', txn: 'payment', rzp: 'payment', recharge: 'payment',
  cod: 'cod', utr: 'cod', remittance: 'cod',
  status: 'status', state: 'status', s: 'status',
  courier: 'courier', carrier: 'courier',
  tag: 'tag',
  wh: 'warehouse', warehouse: 'warehouse', pickup: 'warehouse',
};

// What a seller may type for a status, mapped to the shipment states it covers.
const STATUS: Record<string, string[]> = {
  pickup: ['booked', 'pickup_pending', 'pickup_scheduled'], pending: ['booked', 'pickup_pending', 'pickup_scheduled'], booked: ['booked', 'pickup_pending', 'pickup_scheduled'],
  transit: ['in_transit'], intransit: ['in_transit'], 'in-transit': ['in_transit'], in_transit: ['in_transit'],
  ofd: ['out_for_delivery'], out: ['out_for_delivery'], out_for_delivery: ['out_for_delivery'],
  ndr: ['ndr'], undelivered: ['ndr'],
  delivered: ['delivered'], done: ['delivered'],
  rto: ['rto', 'rto_in_transit'], returned: ['rto', 'rto_in_transit'], return: ['rto', 'rto_in_transit'],
  lost: ['lost'], cancelled: ['cancelled'], canceled: ['cancelled'],
};

export function parseQuery(raw: string): { kind: Kind; value: string; explicit: boolean } {
  const q = raw.trim();
  const m = /^([a-z]{1,10})\s*[:=]\s*(.*)$/i.exec(q);
  if (m && PREFIX[m[1].toLowerCase()]) return { kind: PREFIX[m[1].toLowerCase()], value: m[2].trim(), explicit: true };
  if (q.startsWith('#') && q.length > 1) return { kind: 'order', value: q.slice(1).trim(), explicit: false };
  const compact = q.replace(/[\s-]/g, '');
  if (/^(\+?91)?[6-9]\d{9}$/.test(compact)) return { kind: 'phone', value: compact.replace(/^\+?91(?=\d{10}$)/, ''), explicit: false };
  if (/^\d{6}$/.test(q)) return { kind: 'pin', value: q, explicit: false };
  if (/^nx\d{6,}$/i.test(q)) return { kind: 'nx', value: q, explicit: false };
  if (q.includes('@')) return { kind: 'email', value: q, explicit: false };
  if (/^[a-z]{1,4}\/\d{2}-\d{2}\/\d+/i.test(q)) return { kind: 'invoice', value: q, explicit: false };
  if (/^(order_|pay_|rzp[-_])/i.test(q)) return { kind: 'payment', value: q, explicit: false };
  return { kind: 'any', value: q, explicit: false };
}

const esc = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchRoutes(app: FastifyInstance) {
  app.get('/v1/search', { preHandler: requireSeller, config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (request) => {
    const p = request.principal!;
    const { q } = z.object({ q: z.string().trim().min(1).max(120) }).parse(request.query);
    const intent = parseQuery(q);
    const v = intent.value;
    const like = esc(v);
    const canShip = hasPermission(p, 'shipments.manage'); const canOrders = hasPermission(p, 'orders.manage');
    const canSeePeople = hasPermission(p, 'shipments.view_customer'); // searching by phone / email would otherwise reveal who a hidden number belongs to
    const out: Record<string, unknown> = { intent: { kind: intent.kind, value: v, explicit: intent.explicit }, shipments: [], orders: [], invoices: [], tickets: [], payments: [], cod: [], warehouses: [], pincode: null, statusCounts: null };
    if (!v) return out;

    return withSellerTransaction(p.sellerId, async (c) => {
      const digits = v.replace(/\D/g, '');
      const nxLike = /^nx/i.test(v); // NEXGO order ids are long digit runs, so a short number like 1001 would match them by accident
      // One WHERE for shipments and for not-yet-shipped orders (aliases: s shipment, o order, c customer, cp courier, w warehouse).
      const cond = (kind: Kind, shipped: boolean): { sql: string; args: unknown[] } | null => {
        const has = (cols: string) => ({ sql: `(${cols})`, args: [`%${like}%`] });
        switch (kind) {
          case 'awb': return shipped ? { sql: `(s.awb ILIKE $2 OR s.provider_shipment_id = $3 )`, args: [`%${like}%`, v] } : null;
          case 'order': return has(`o.order_number ILIKE $2 OR o.external_reference ILIKE $2${nxLike ? ' OR o.nexgo_order_id ILIKE $2' : ''}`);
          case 'nx': return has(`o.nexgo_order_id ILIKE $2`);
          case 'phone': return digits.length >= 4 && canSeePeople ? { sql: `regexp_replace(c.phone,'\\D','','g') LIKE $2`, args: [`%${digits}%`] } : null;
          case 'email': return canSeePeople ? has(`c.email ILIKE $2`) : null;
          case 'pin': return { sql: `c.pincode = $2`, args: [v] };
          case 'name': return has(`c.full_name ILIKE $2`);
          case 'courier': return shipped ? has(`cp.name ILIKE $2 OR cs.display_name ILIKE $2`) : null;
          case 'warehouse': return has(`w.name ILIKE $2 OR w.city ILIKE $2`);
          case 'tag': return shipped ? has(`EXISTS (SELECT 1 FROM unnest(s.tags) t WHERE t ILIKE $2)`) : null;
          case 'status': {
            const states = STATUS[v.toLowerCase().replace(/\s+/g, '')];
            return states && shipped ? { sql: `s.state::text = ANY($2::text[])`, args: [states] } : null;
          }
          case 'any': return v.length >= 2 ? has(`${shipped ? 's.awb ILIKE $2 OR ' : ''}o.order_number ILIKE $2 OR ${nxLike ? 'o.nexgo_order_id ILIKE $2 OR ' : ''}o.external_reference ILIKE $2 OR c.full_name ILIKE $2`) : null;
          default: return null;
        }
      };

      if (canShip || canOrders) {
        const ship = cond(intent.kind, true);
        if (ship && canShip) {
          const rows = (await c.query(
            `SELECT s.id, s.awb, s.state, s.rto_status, s.booked_at, s.tags, s.routing_code, s.shipping_charge_paise, o.order_number, o.nexgo_order_id, o.channel, o.payment_mode, o.cod_amount_paise,
                    c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode, cp.name AS courier_name, w.city AS warehouse_city,
                    ev.description AS last_description, ev.location AS last_location, ev.occurred_at AS last_event_at
               FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id JOIN warehouses w ON w.id=o.warehouse_id
               JOIN courier_providers cp ON cp.id=s.provider_id JOIN courier_services cs ON cs.id=s.service_id
               LEFT JOIN LATERAL (SELECT description, location, occurred_at FROM shipment_events WHERE shipment_id=s.id ORDER BY occurred_at DESC LIMIT 1) ev ON true
              WHERE s.seller_id=$1 AND ${ship.sql}
              ORDER BY (s.awb = $${ship.args.length + 2} OR o.order_number = $${ship.args.length + 2}) DESC, s.created_at DESC LIMIT 8`, [p.sellerId, ...ship.args, v])).rows;
          out.shipments = maskCustomerRows(rows, p, 'shipments.view_customer');
        }
        const ord = cond(intent.kind, false);
        if (ord && canOrders && intent.kind !== 'status') {
          const rows = (await c.query(
            `SELECT o.id, o.order_number, o.nexgo_order_id, o.channel, o.state, o.payment_mode, o.cod_amount_paise, o.created_at, c.full_name AS customer_name, c.phone AS customer_phone, c.city AS customer_city, c.pincode AS customer_pincode
               FROM orders o JOIN customers c ON c.id=o.customer_id JOIN warehouses w ON w.id=o.warehouse_id
              WHERE o.seller_id=$1 AND o.state IN ('new','ready_to_ship') AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id=o.id AND s.state <> 'cancelled') AND ${ord.sql}
              ORDER BY o.created_at DESC LIMIT 5`, [p.sellerId, ...ord.args])).rows;
          out.orders = maskCustomerRows(rows, p, 'shipments.view_customer');
        }
      }
      if (['invoice', 'any'].includes(intent.kind) && (intent.kind === 'invoice' || /[\/\d]/.test(v)) && v.length >= 2) out.invoices = (await c.query(`SELECT id, invoice_number, status, total_paise, period_start, period_end FROM invoices WHERE seller_id=$1 AND invoice_number ILIKE $2 ORDER BY created_at DESC LIMIT 5`, [p.sellerId, `%${like}%`])).rows;
      if (intent.kind === 'ticket') out.tickets = (await c.query(`SELECT id, subject, category, state, priority, created_at FROM support_tickets WHERE seller_id=$1 AND (subject ILIKE $2 OR id::text ILIKE $3) ORDER BY created_at DESC LIMIT 5`, [p.sellerId, `%${like}%`, `${like}%`])).rows;
      if (intent.kind === 'payment') out.payments = (await c.query(`SELECT id, amount_paise, status, provider_order_id, provider_payment_id, created_at FROM wallet_recharges WHERE seller_id=$1 AND (provider_order_id ILIKE $2 OR provider_payment_id ILIKE $2) ORDER BY created_at DESC LIMIT 5`, [p.sellerId, `%${like}%`])).rows;
      if (intent.kind === 'cod') out.cod = (await c.query(`SELECT id, cycle_start, cycle_end, status, net_remitted_paise, bank_reference FROM cod_remittance_cycles WHERE seller_id=$1 AND bank_reference ILIKE $2 ORDER BY cycle_end DESC LIMIT 5`, [p.sellerId, `%${like}%`])).rows;
      if (intent.kind === 'warehouse') out.warehouses = (await c.query(`SELECT id, name, city, pincode FROM warehouses WHERE seller_id=$1 AND (name ILIKE $2 OR city ILIKE $2) ORDER BY name LIMIT 5`, [p.sellerId, `%${like}%`])).rows;
      if (intent.kind === 'pin' && /^\d{6}$/.test(v)) {
        const info = (await c.query(`SELECT pin.city, pin.state, EXISTS (SELECT 1 FROM platform_pincode_blocks b WHERE b.pincode=pin.pincode) AS blocked FROM pincodes pin WHERE pin.pincode=$1`, [v])).rows[0];
        const sent = canShip ? (await c.query(`SELECT count(*)::int AS n FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers cu ON cu.id=o.customer_id WHERE s.seller_id=$1 AND cu.pincode=$2`, [p.sellerId, v])).rows[0].n : 0;
        out.pincode = { pincode: v, city: info?.city ?? null, state: info?.state ?? null, known: Boolean(info), blocked: Boolean(info?.blocked), shipments: sent };
      }
      if (intent.kind === 'status' && canShip) {
        const states = STATUS[v.toLowerCase().replace(/\s+/g, '')];
        if (states) out.statusCounts = { states, total: (await c.query(`SELECT count(*)::int AS n FROM shipments WHERE seller_id=$1 AND state::text = ANY($2::text[])`, [p.sellerId, states])).rows[0].n };
      }
      return out;
    });
  });
}
