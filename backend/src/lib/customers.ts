import type { PoolClient } from 'pg';

/**
 * The consignee of an order. A customer record is shared between orders only when EVERY detail is the same: the same phone and pincode with another name or address is
 * another consignee (a repeat buyer who moved, two people behind one number). Matching on phone and pincode alone used to ship such orders to the old address (ORD-010).
 */
export type Consignee = { fullName: string; email?: string | null; phone: string; addressLine1: string; addressLine2?: string | null; city: string; state: string; pincode: string; companyName?: string | null; alternatePhone?: string | null; landmark?: string | null };
type Row = { id: string; full_name: string; email: string | null; phone: string; address_line_1: string; address_line_2: string | null; city: string; state: string; pincode: string; company_name: string | null; alternate_phone: string | null; landmark: string | null };
const COLUMNS = 'id, full_name, email::text AS email, phone, address_line_1, address_line_2, city, state, pincode, company_name, alternate_phone, landmark';
const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Identical consignees have the same key. */
export const consigneeKey = (c: Consignee) => [c.phone, c.pincode, c.fullName, c.email, c.addressLine1, c.addressLine2, c.city, c.state, c.companyName, c.alternatePhone, c.landmark].map(norm).join('|');
const rowKey = (r: Row) => consigneeKey({ fullName: r.full_name, email: r.email, phone: r.phone, addressLine1: r.address_line_1, addressLine2: r.address_line_2, city: r.city, state: r.state, pincode: r.pincode, companyName: r.company_name, alternatePhone: r.alternate_phone, landmark: r.landmark });

/** Ids for many consignees at once (two statements, whatever the number): key -> customer id. */
export async function customerIdsFor(client: PoolClient, sellerId: string, list: Consignee[]): Promise<Map<string, string>> {
  const wanted = new Map(list.map((c) => [consigneeKey(c), c]));
  const out = new Map<string, string>();
  const have = await client.query<Row>(`SELECT ${COLUMNS} FROM customers WHERE seller_id = $1 AND phone = ANY($2::text[]) ORDER BY created_at`, [sellerId, [...new Set(list.map((c) => c.phone))]]);
  for (const r of have.rows) { const k = rowKey(r); if (wanted.has(k) && !out.has(k)) out.set(k, r.id); }
  const missing = [...wanted.entries()].filter(([k]) => !out.has(k)).map(([, c]) => ({ full_name: c.fullName, email: c.email || null, phone: c.phone, address_line_1: c.addressLine1, address_line_2: c.addressLine2 || null, city: c.city, state: c.state, pincode: c.pincode, company_name: c.companyName || null, alternate_phone: c.alternatePhone || null, landmark: c.landmark || null }));
  if (missing.length) {
    const made = await client.query<Row>(
      `INSERT INTO customers (seller_id, full_name, email, phone, address_line_1, address_line_2, city, state, pincode, company_name, alternate_phone, landmark)
       SELECT $1, x.full_name, x.email, x.phone, x.address_line_1, x.address_line_2, x.city, x.state, x.pincode, x.company_name, x.alternate_phone, x.landmark
         FROM jsonb_to_recordset($2::jsonb) AS x(full_name text, email text, phone text, address_line_1 text, address_line_2 text, city text, state text, pincode text, company_name text, alternate_phone text, landmark text)
       RETURNING ${COLUMNS}`, [sellerId, JSON.stringify(missing)]);
    for (const r of made.rows) out.set(rowKey(r), r.id);
  }
  return out;
}

export async function customerIdFor(client: PoolClient, sellerId: string, c: Consignee): Promise<string> {
  const id = (await customerIdsFor(client, sellerId, [c])).get(consigneeKey(c));
  if (!id) throw new Error('The customer could not be saved');
  return id;
}
