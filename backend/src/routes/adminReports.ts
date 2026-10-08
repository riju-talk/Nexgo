import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requirePlatformAdmin } from '../lib/adminAuth.js';

// All four admin report screens share one response shape so the frontend can
// render them with a single component: a headline, a 30-day series, labelled
// signals and a detail table. Money is in paise; the client formats it.
type Cell = string | number | null;
type Report = {
  headline: { label: string; value: Cell; format: 'inr' | 'percent' | 'number'; note: string };
  series: { label: string; points: { day: string; value: number }[]; format: 'inr' | 'percent' | 'number' };
  signals: { label: string; value: Cell; format: 'inr' | 'percent' | 'number' | 'days' | 'text' }[];
  table: { title: string; columns: string[]; formats: ('text' | 'inr' | 'percent' | 'number')[]; rows: Cell[][] };
  generatedAt: string;
};

const num = (v: unknown) => Number(v ?? 0);
const DAYS = `generate_series(current_date-interval '29 days',current_date,interval '1 day')`;

export async function adminReportRoutes(app: FastifyInstance) {
  app.get('/v1/admin/reports/revenue', { preHandler: requirePlatformAdmin }, async (): Promise<Report> => {
    const [total, series, mix, sellers] = await Promise.all([
      db.query(`SELECT COALESCE(sum(shipping_charge_paise),0) AS v FROM shipments WHERE state<>'cancelled' AND booked_at>=current_date-interval '29 days'`),
      db.query(`SELECT to_char(d::date,'DD Mon') AS day,(SELECT COALESCE(sum(shipping_charge_paise),0) FROM shipments s WHERE s.state<>'cancelled' AND s.booked_at::date=d::date) AS v FROM ${DAYS} d ORDER BY d`),
      db.query(`SELECT
        (SELECT COALESCE(sum(subtotal_paise),0) FROM invoices WHERE status='issued' AND issued_at>=current_date-interval '29 days') AS invoiced,
        (SELECT COALESCE(sum(gst_paise),0) FROM invoices WHERE status='issued' AND issued_at>=current_date-interval '29 days') AS gst,
        (SELECT COALESCE(sum(amount_paise),0) FROM wallet_entries WHERE entry_type='credit' AND created_at>=current_date-interval '29 days') AS recharged,
        (SELECT count(*) FROM shipments WHERE state<>'cancelled' AND booked_at>=current_date-interval '29 days') AS shipments`),
      db.query(`SELECT s.legal_name,count(*)::int AS shipments,COALESCE(sum(sh.shipping_charge_paise),0) AS v FROM shipments sh JOIN sellers s ON s.id=sh.seller_id WHERE sh.state<>'cancelled' AND sh.booked_at>=current_date-interval '29 days' GROUP BY s.legal_name ORDER BY v DESC LIMIT 15`),
    ]);
    const m = mix.rows[0];
    return {
      headline: { label: 'Gross shipping value, last 30 days', value: num(total.rows[0].v), format: 'inr', note: `${num(m.shipments)} shipments booked` },
      series: { label: 'Daily shipping value', format: 'inr', points: series.rows.map((r) => ({ day: r.day, value: num(r.v) })) },
      signals: [
        { label: 'Invoiced (excl. GST)', value: num(m.invoiced), format: 'inr' },
        { label: 'GST on issued invoices', value: num(m.gst), format: 'inr' },
        { label: 'Wallet recharges', value: num(m.recharged), format: 'inr' },
        { label: 'Average per shipment', value: num(m.shipments) ? Math.round(num(total.rows[0].v) / num(m.shipments)) : 0, format: 'inr' },
      ],
      table: { title: 'Top sellers by shipping value', columns: ['Seller', 'Shipments', 'Shipping value'], formats: ['text', 'number', 'inr'], rows: sellers.rows.map((r) => [r.legal_name, r.shipments, num(r.v)]) },
      generatedAt: new Date().toISOString(),
    };
  });

  app.get('/v1/admin/reports/sla', { preHandler: requirePlatformAdmin }, async (): Promise<Report> => {
    const [overall, series, couriers] = await Promise.all([
      db.query(`SELECT
        count(*) FILTER (WHERE state='delivered' AND promised_delivery_at IS NOT NULL)::int AS promised,
        count(*) FILTER (WHERE state='delivered' AND promised_delivery_at IS NOT NULL AND delivered_at<=promised_delivery_at)::int AS on_time,
        count(*) FILTER (WHERE pickup_deadline_at IS NOT NULL AND pickup_completed_at IS NOT NULL)::int AS pickups,
        count(*) FILTER (WHERE pickup_deadline_at IS NOT NULL AND pickup_completed_at<=pickup_deadline_at)::int AS pickups_ok,
        count(*) FILTER (WHERE state='rto')::int AS rto, count(*) FILTER (WHERE state<>'cancelled')::int AS total
        FROM shipments WHERE booked_at>=current_date-interval '29 days'`),
      db.query(`SELECT to_char(d::date,'DD Mon') AS day,
        COALESCE(round(100.0*count(*) FILTER (WHERE s.delivered_at<=s.promised_delivery_at)/NULLIF(count(*),0),1),0) AS v
        FROM ${DAYS} d LEFT JOIN shipments s ON s.state='delivered' AND s.promised_delivery_at IS NOT NULL AND s.delivered_at::date=d::date GROUP BY d ORDER BY d`),
      db.query(`SELECT cp.name,count(*)::int AS total,
        count(*) FILTER (WHERE s.state='delivered')::int AS delivered,
        COALESCE(round(100.0*count(*) FILTER (WHERE s.state='delivered' AND s.promised_delivery_at IS NOT NULL AND s.delivered_at<=s.promised_delivery_at)/NULLIF(count(*) FILTER (WHERE s.state='delivered' AND s.promised_delivery_at IS NOT NULL),0),1),0) AS on_time,
        COALESCE(round(100.0*count(*) FILTER (WHERE s.state='rto')/NULLIF(count(*),0),1),0) AS rto
        FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.state<>'cancelled' AND s.booked_at>=current_date-interval '29 days' GROUP BY cp.name ORDER BY total DESC`),
    ]);
    const o = overall.rows[0]; const pct = (a: unknown, b: unknown) => (num(b) ? +((100 * num(a)) / num(b)).toFixed(1) : 0);
    return {
      headline: { label: 'Delivered within promise, last 30 days', value: pct(o.on_time, o.promised), format: 'percent', note: `${num(o.promised)} delivered shipments with a promise date` },
      series: { label: 'Daily on-time delivery', format: 'percent', points: series.rows.map((r) => ({ day: r.day, value: num(r.v) })) },
      signals: [
        { label: 'Pickup within deadline', value: num(o.pickups) ? pct(o.pickups_ok, o.pickups) : 'No data yet', format: num(o.pickups) ? 'percent' : 'text' },
        { label: 'RTO rate', value: pct(o.rto, o.total), format: 'percent' },
        { label: 'Shipments measured', value: num(o.total), format: 'number' },
      ],
      table: { title: 'Courier SLA scorecard', columns: ['Courier', 'Shipments', 'Delivered', 'On time', 'RTO'], formats: ['text', 'number', 'number', 'percent', 'percent'], rows: couriers.rows.map((r) => [r.name, r.total, r.delivered, num(r.on_time), num(r.rto)]) },
      generatedAt: new Date().toISOString(),
    };
  });

  app.get('/v1/admin/reports/courier-analytics', { preHandler: requirePlatformAdmin }, async (): Promise<Report> => {
    const [couriers, series] = await Promise.all([
      db.query(`SELECT cp.name,count(*)::int AS total,
        COALESCE(round(100.0*count(*) FILTER (WHERE s.state='delivered')/NULLIF(count(*),0),1),0) AS delivery_rate,
        COALESCE(round(100.0*count(*) FILTER (WHERE s.state='ndr')/NULLIF(count(*),0),1),0) AS ndr_rate,
        COALESCE(round(avg(EXTRACT(epoch FROM (s.delivered_at-s.booked_at))/86400) FILTER (WHERE s.delivered_at IS NOT NULL)::numeric,1),0) AS avg_days,
        COALESCE(round(avg(s.shipping_charge_paise)),0) AS avg_charge
        FROM shipments s JOIN courier_providers cp ON cp.id=s.provider_id WHERE s.state<>'cancelled' AND s.booked_at>=current_date-interval '29 days' GROUP BY cp.name ORDER BY total DESC`),
      db.query(`SELECT to_char(d::date,'DD Mon') AS day,(SELECT count(*) FROM shipments s WHERE s.state<>'cancelled' AND s.booked_at::date=d::date) AS v FROM ${DAYS} d ORDER BY d`),
    ]);
    const rows = couriers.rows;
    const best = (key: string, dir: 1 | -1, fmt: (r: Record<string, unknown>) => string) => { const c = rows.filter((r) => num(r.total) > 0).sort((a, b) => dir * (num(a[key]) - num(b[key])))[0]; return c ? `${c.name} · ${fmt(c)}` : 'No data yet'; };
    return {
      headline: { label: 'Couriers with volume, last 30 days', value: rows.length, format: 'number', note: `${rows.reduce((s, r) => s + num(r.total), 0)} shipments compared` },
      series: { label: 'Daily shipments booked', format: 'number', points: series.rows.map((r) => ({ day: r.day, value: num(r.v) })) },
      signals: [
        { label: 'Best delivery rate', value: best('delivery_rate', -1, (r) => `${r.delivery_rate}%`), format: 'text' },
        { label: 'Lowest NDR', value: best('ndr_rate', 1, (r) => `${r.ndr_rate}%`), format: 'text' },
        { label: 'Fastest delivery', value: best('avg_days', 1, (r) => `${r.avg_days}d`), format: 'text' },
        { label: 'Lowest average charge', value: best('avg_charge', 1, (r) => `₹${(num(r.avg_charge) / 100).toFixed(0)}`), format: 'text' },
      ],
      table: { title: 'Courier performance', columns: ['Courier', 'Shipments', 'Delivery rate', 'NDR rate', 'Avg days', 'Avg charge'], formats: ['text', 'number', 'percent', 'percent', 'number', 'inr'], rows: rows.map((r) => [r.name, r.total, num(r.delivery_rate), num(r.ndr_rate), num(r.avg_days), num(r.avg_charge)]) },
      generatedAt: new Date().toISOString(),
    };
  });

  app.get('/v1/admin/reports/gst', { preHandler: requirePlatformAdmin }, async (): Promise<Report> => {
    const [totals, series, sellers] = await Promise.all([
      db.query(`SELECT COALESCE(sum(subtotal_paise),0) AS taxable,COALESCE(sum(gst_paise),0) AS gst,count(*)::int AS invoices,
        (SELECT count(*) FROM sellers s LEFT JOIN seller_kyc k ON k.seller_id=s.id WHERE s.state='active' AND k.gstin IS NULL)::int AS missing_gstin
        FROM invoices WHERE status='issued' AND issued_at>=date_trunc('month',current_date)`),
      db.query(`SELECT to_char(d::date,'DD Mon') AS day,(SELECT COALESCE(sum(gst_paise),0) FROM invoices i WHERE i.status='issued' AND i.issued_at::date=d::date) AS v FROM ${DAYS} d ORDER BY d`),
      db.query(`SELECT s.legal_name,COALESCE(k.gstin,'') AS gstin,count(*)::int AS invoices,sum(i.subtotal_paise) AS taxable,sum(i.gst_paise) AS gst
        FROM invoices i JOIN sellers s ON s.id=i.seller_id LEFT JOIN seller_kyc k ON k.seller_id=s.id WHERE i.status='issued' AND i.issued_at>=date_trunc('month',current_date) GROUP BY s.legal_name,k.gstin ORDER BY taxable DESC LIMIT 50`),
    ]);
    const t = totals.rows[0];
    return {
      headline: { label: 'GST on invoices issued this month', value: num(t.gst), format: 'inr', note: `${num(t.invoices)} invoices issued` },
      series: { label: 'Daily GST invoiced', format: 'inr', points: series.rows.map((r) => ({ day: r.day, value: num(r.v) })) },
      signals: [
        { label: 'Taxable value', value: num(t.taxable), format: 'inr' },
        { label: 'Active sellers missing GSTIN', value: num(t.missing_gstin), format: 'number' },
        { label: 'Invoices issued', value: num(t.invoices), format: 'number' },
      ],
      table: { title: 'Invoices by seller this month', columns: ['Seller', 'GSTIN', 'Invoices', 'Taxable value', 'GST'], formats: ['text', 'text', 'number', 'inr', 'inr'], rows: sellers.rows.map((r) => [r.legal_name, r.gstin || 'Missing', r.invoices, num(r.taxable), num(r.gst)]) },
      generatedAt: new Date().toISOString(),
    };
  });
}
