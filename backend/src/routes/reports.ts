import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSellerTransaction } from '../db/client.js';
import { audit } from '../lib/audit.js';
import { requireSeller } from './seller.js';

function principal(request: FastifyRequest) { if (!request.principal) throw Object.assign(new Error('Authentication required'), { statusCode: 401 }); return request.principal; }

const MAX_ROWS = 20000;
const PREVIEW_ROWS = 25;
const D = (col: string) => `to_char(${col},'YYYY-MM-DD HH24:MI')`;
const RS = (col: string) => `round(${col}/100.0,2)`;

type Def = { label: string; description: string; statuses: string[]; columns: [string, string][]; from: string; dateCol: string; stateCol?: string; order: string; custom?: undefined };
type Custom = { label: string; description: string; statuses: string[]; custom: true };

// Every expression below is a constant, never user input; filters are bound parameters.
const SHIPMENT_FROM = `shipments s JOIN orders o ON o.id=s.order_id JOIN customers cu ON cu.id=o.customer_id JOIN courier_providers cp ON cp.id=s.provider_id`;
const DEFS: Record<string, Def | Custom> = {
  mis: { label: 'MIS summary', description: 'Day-by-day orders, bookings, deliveries, exceptions and shipping spend.', statuses: [], custom: true },
  shipments: {
    label: 'Shipment register', description: 'Every booked shipment with courier, weight, charge and delivery dates.',
    statuses: ['booked', 'in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto', 'cancelled'],
    columns: [['AWB', 's.awb'], ['Order', 'o.order_number'], ['Courier', 'cp.name'], ['Status', 's.state::text'], ['Payment', 'o.payment_mode::text'], ['COD INR', RS('o.cod_amount_paise')], ['Weight g', 's.chargeable_weight_g'], ['Charge INR', RS('s.shipping_charge_paise')], ['Destination', "COALESCE(s.destination_city,cu.city,'')"], ['Pincode', "COALESCE(s.destination_pincode,cu.pincode,'')"], ['Booked', D('s.booked_at')], ['Delivered', `COALESCE(${D('s.delivered_at')},'')`]],
    from: SHIPMENT_FROM, dateCol: 's.booked_at', stateCol: 's.state::text', order: 's.booked_at DESC',
  },
  orders: {
    label: 'Order register', description: 'All orders created in the period with payment mode and value.',
    statuses: ['draft', 'new', 'ready_to_ship', 'booked', 'cancelled', 'returned'],
    columns: [['Order', 'o.order_number'], ['External ref', "COALESCE(o.external_reference,'')"], ['Flow', 'o.order_flow'], ['Status', 'o.state::text'], ['Payment', 'o.payment_mode::text'], ['COD INR', RS('o.cod_amount_paise')], ['Value INR', RS('o.subtotal_paise')], ['Weight g', 'o.total_weight_g'], ['Created', D('o.created_at')]],
    from: 'orders o', dateCol: 'o.created_at', stateCol: 'o.state::text', order: 'o.created_at DESC',
  },
  ndr: {
    label: 'NDR report', description: 'Non-delivery cases with reasons, age and resolution.',
    statuses: ['open', 'reattempt_requested', 'rto_requested', 'resolved'],
    columns: [['AWB', 's.awb'], ['Order', 'o.order_number'], ['Courier', 'cp.name'], ['Reason', 'n.reason_code'], ['Detail', "COALESCE(n.reason_detail,'')"], ['Status', 'n.state::text'], ['Opened', D('n.opened_at')], ['Resolved', `COALESCE(${D('n.resolved_at')},'')`]],
    from: 'ndr_cases n JOIN shipments s ON s.id=n.shipment_id JOIN orders o ON o.id=s.order_id JOIN courier_providers cp ON cp.id=s.provider_id', dateCol: 'n.opened_at', stateCol: 'n.state::text', order: 'n.opened_at DESC',
  },
  weight: {
    label: 'Weight discrepancy', description: 'Shipments billed above the declared order weight.',
    statuses: [],
    columns: [['AWB', 's.awb'], ['Order', 'o.order_number'], ['Courier', 'cp.name'], ['Declared g', 'o.total_weight_g'], ['Billed g', 's.chargeable_weight_g'], ['Difference g', '(s.chargeable_weight_g-o.total_weight_g)'], ['Charge INR', RS('s.shipping_charge_paise')], ['Booked', D('s.booked_at')]],
    from: `${SHIPMENT_FROM}`, dateCol: 's.booked_at', order: 's.booked_at DESC',
  },
  cod: {
    label: 'COD remittance', description: 'COD payout cycles with collected, deducted and remitted amounts.',
    statuses: ['pending', 'approved', 'remitted'],
    columns: [['Cycle start', "to_char(c.cycle_start,'YYYY-MM-DD')"], ['Cycle end', "to_char(c.cycle_end,'YYYY-MM-DD')"], ['Shipments', 'c.shipment_count'], ['Collected INR', RS('c.cod_collected_paise')], ['Deducted INR', RS('c.charges_deducted_paise')], ['Net INR', RS('c.net_remitted_paise')], ['Status', 'c.status::text'], ['Bank ref', "COALESCE(c.bank_reference,'')"]],
    from: 'cod_remittance_cycles c', dateCol: 'c.cycle_start::timestamptz', stateCol: 'c.status::text', order: 'c.cycle_start DESC',
  },
  wallet: {
    label: 'Wallet ledger', description: 'Recharges, shipping debits, holds and releases.',
    statuses: ['credit', 'debit', 'hold', 'release', 'adjustment'],
    columns: [['Date', D('w.created_at')], ['Type', 'w.entry_type::text'], ['Amount INR', RS('w.amount_paise')], ['Narration', 'w.description'], ['Reference', 'w.reference_id']],
    from: 'wallet_entries w', dateCol: 'w.created_at', stateCol: 'w.entry_type::text', order: 'w.created_at DESC',
  },
};

const SELLER_ALIAS: Record<string, string> = { shipments: 's', orders: 'o', ndr: 'n', weight: 's', cod: 'c', wallet: 'w' };

const dateRange = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const generateInput = dateRange.extend({ type: z.string().refine((v) => v in DEFS, 'Unknown report type'), status: z.string().trim().max(40).optional() })
  .refine((v) => v.to >= v.from, { message: 'End date must be on or after the start date' })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86400000 <= 366, { message: 'Choose a range of at most 366 days' });

const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet formula injection: neutralise text cells that start like a formula (numbers are left alone).
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const toCsv = (columns: string[], rows: unknown[][]) => [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

async function build(client: PoolClient, sellerId: string, type: string, from: string, to: string, status?: string) {
  const def = DEFS[type];
  if (def.custom) {
    const r = await client.query(
      `WITH days AS (SELECT d::date AS day FROM generate_series($2::date,$3::date,interval '1 day') d)
       SELECT to_char(days.day,'YYYY-MM-DD') AS day,
         (SELECT count(*) FROM orders o WHERE o.seller_id=$1 AND o.created_at::date=days.day)::int AS orders,
         (SELECT count(*) FROM shipments s WHERE s.seller_id=$1 AND s.booked_at::date=days.day)::int AS booked,
         (SELECT count(*) FROM shipments s WHERE s.seller_id=$1 AND s.delivered_at::date=days.day)::int AS delivered,
         (SELECT count(*) FROM ndr_cases n WHERE n.seller_id=$1 AND n.opened_at::date=days.day)::int AS ndr,
         (SELECT count(*) FROM shipments s WHERE s.seller_id=$1 AND s.state='rto' AND s.updated_at::date=days.day)::int AS rto,
         (SELECT COALESCE(round(sum(s.shipping_charge_paise)/100.0,2),0) FROM shipments s WHERE s.seller_id=$1 AND s.booked_at::date=days.day AND s.state<>'cancelled') AS spend
       FROM days ORDER BY days.day`, [sellerId, from, to]);
    return { columns: ['Date', 'Orders', 'Shipments booked', 'Delivered', 'NDR opened', 'RTO', 'Shipping spend INR'], rows: r.rows.map((x) => [x.day, x.orders, x.booked, x.delivered, x.ndr, x.rto, x.spend]) };
  }
  const where = [`${SELLER_ALIAS[type]}.seller_id=$1`, `${def.dateCol} >= $2::date`, `${def.dateCol} < $3::date + 1`];
  const args: unknown[] = [sellerId, from, to];
  if (type === 'weight') where.push('s.chargeable_weight_g>o.total_weight_g');
  if (status && def.stateCol) { args.push(status); where.push(`${def.stateCol}=$${args.length}`); }
  const r = await client.query({ text: `SELECT ${def.columns.map(([, e], i) => `${e} AS c${i}`).join(',')} FROM ${def.from} WHERE ${where.join(' AND ')} ORDER BY ${def.order} LIMIT ${MAX_ROWS}`, values: args, rowMode: 'array' });
  return { columns: def.columns.map(([h]) => h), rows: r.rows as unknown[][] };
}

const RUN_COLUMNS = 'id,report_type,range_start::text AS range_start,range_end::text AS range_end,status_filter,state,row_count,file_name,created_at';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/v1/reports/types', { preHandler: requireSeller }, async () => ({
    items: Object.entries(DEFS).map(([id, d]) => ({ id, label: d.label, description: d.description, statuses: d.statuses })),
  }));

  app.get('/v1/reports', { preHandler: requireSeller }, async (request) => {
    const p = principal(request);
    return withSellerTransaction(p.sellerId, async (client) => ({
      items: (await client.query(`SELECT ${RUN_COLUMNS},(SELECT u.full_name FROM users u WHERE u.id=report_runs.created_by) AS generated_by FROM report_runs WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 20`, [p.sellerId])).rows,
    }));
  });

  app.post('/v1/reports', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request);
    const input = generateInput.parse(request.body);
    const def = DEFS[input.type];
    if (input.status && input.status !== 'all' && !def.statuses.includes(input.status)) throw Object.assign(new Error(`Status "${input.status}" does not apply to this report`), { statusCode: 400 });
    const status = input.status && input.status !== 'all' ? input.status : undefined;
    const run = await withSellerTransaction(p.sellerId, async (client) => {
      const { columns, rows } = await build(client, p.sellerId, input.type, input.from, input.to, status);
      const fileName = `${input.type}-${input.from}-to-${input.to}.csv`;
      const inserted = await client.query(
        `INSERT INTO report_runs(seller_id,report_type,range_start,range_end,status_filter,row_count,file_name,csv_content,preview,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${RUN_COLUMNS}`,
        [p.sellerId, input.type, input.from, input.to, status ?? null, rows.length, fileName, toCsv(columns, rows), JSON.stringify({ columns, rows: rows.slice(0, PREVIEW_ROWS), truncated: rows.length >= MAX_ROWS }), p.userId]);
      await audit(client, { sellerId: p.sellerId, actorUserId: p.userId, action: 'report.generated', targetType: 'report_run', targetId: inserted.rows[0].id, requestId: request.id, metadata: { type: input.type, rows: rows.length } });
      return { ...inserted.rows[0], preview: { columns, rows: rows.slice(0, PREVIEW_ROWS), truncated: rows.length >= MAX_ROWS } };
    });
    return reply.code(201).send(run);
  });

  app.get('/v1/reports/:reportId', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request); const id = z.string().uuid().parse((request.params as { reportId: string }).reportId);
    const row = await withSellerTransaction(p.sellerId, async (client) => (await client.query(`SELECT ${RUN_COLUMNS},preview FROM report_runs WHERE id=$1 AND seller_id=$2`, [id, p.sellerId])).rows[0]);
    if (!row) return reply.code(404).send({ error: 'REPORT_NOT_FOUND' });
    return row;
  });

  app.get('/v1/reports/:reportId/download', { preHandler: requireSeller }, async (request, reply) => {
    const p = principal(request); const id = z.string().uuid().parse((request.params as { reportId: string }).reportId);
    const row = await withSellerTransaction(p.sellerId, async (client) => (await client.query('SELECT file_name,csv_content FROM report_runs WHERE id=$1 AND seller_id=$2', [id, p.sellerId])).rows[0]);
    if (!row) return reply.code(404).send({ error: 'REPORT_NOT_FOUND' });
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${row.file_name}"`).send(row.csv_content);
  });
}
