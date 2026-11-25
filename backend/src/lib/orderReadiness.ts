import type { PoolClient } from 'pg';

/**
 * Is an order complete enough to be sent to a courier? ONE rule, used by every way an order can be booked (manual book, synchronous auto-assign, the assign
 * queue, bulk assign) and by Track's tabs (READY_SQL in routes/shipments.ts is the same rule in SQL; the e2e test tests/e2e/readiness.mjs proves they agree).
 *
 * Before this existed the booking path did not check it: an order with no weight was booked at the courier at 1 gram, one with no dimensions at 10 cm, and an
 * order could be moved to "ready to ship" even though it could not be booked (defects ORD-001, ORD-004, BOOK-010).
 *
 * Every issue carries a stable code, the field, a plain sentence and the action that fixes it (spec 3.4).
 */
export type ReadinessFacts = {
  full_name: string | null; phone: string | null; address_line_1: string | null; pincode: string | null; city: string | null; state: string | null;
  total_weight_g: number | null; package_length_mm: number | null; package_width_mm: number | null; package_height_mm: number | null;
  payment_mode: string | null; cod_amount_paise: number | null;
};
export type ReadinessIssue = { code: string; field: string; message: string; action: string };

const FIX = 'Fix it in Track > Needs fixing, then book again.';

export function readinessIssues(f: ReadinessFacts): ReadinessIssue[] {
  const out: ReadinessIssue[] = [];
  const add = (code: string, field: string, message: string, action = FIX) => out.push({ code, field, message, action });
  if ((f.full_name ?? '').trim().length < 2) add('CUSTOMER_NAME_MISSING', 'customer.fullName', 'The customer name is missing or too short.');
  const digits = (f.phone ?? '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(digits.slice(-10))) add('CUSTOMER_PHONE_INVALID', 'customer.phone', 'The customer mobile number is not valid (10 digits starting 6-9).');
  if ((f.address_line_1 ?? '').trim().length < 3) add('CUSTOMER_ADDRESS_MISSING', 'customer.addressLine1', 'The customer address is missing or too short.');
  if (!/^\d{6}$/.test(f.pincode ?? '')) add('CUSTOMER_PINCODE_INVALID', 'customer.pincode', 'The delivery pincode must be exactly 6 digits.');
  if (!(f.city ?? '').length) add('CUSTOMER_CITY_MISSING', 'customer.city', 'The delivery city is missing.');
  if (!(f.state ?? '').length) add('CUSTOMER_STATE_MISSING', 'customer.state', 'The delivery state is missing.');
  if (!((f.total_weight_g ?? 0) > 0)) add('WEIGHT_MISSING', 'package.weightG', 'The package weight is missing.');
  const dims: [number | null, string, string][] = [[f.package_length_mm, 'package.lengthMm', 'length'], [f.package_width_mm, 'package.widthMm', 'width'], [f.package_height_mm, 'package.heightMm', 'height']];
  for (const [value, field, name] of dims) if (value === null || value === undefined || !(value > 0)) add('DIMENSION_MISSING', field, `The package ${name} is missing.`);
  if (f.payment_mode === 'cod' && !((f.cod_amount_paise ?? 0) > 0)) add('COD_AMOUNT_MISSING', 'codAmountPaise', 'The cash-on-delivery amount is missing.');
  return out;
}

/** One readable sentence for a toast / failed row; the full list is on the error as `issues`. */
export function readinessSentence(issues: ReadinessIssue[]): string {
  // The three dimension problems are one problem for the seller: say it once.
  const dims = issues.filter((i) => i.code === 'DIMENSION_MISSING');
  const parts = issues.filter((i) => i.code !== 'DIMENSION_MISSING').map((i) => i.message.replace(/\.$/, ''));
  if (dims.length) parts.push(dims.length === 3 ? 'The package size (length, width, height) is missing' : `The package ${dims.map((d) => d.field.split('.').pop()!.replace('Mm', '')).join(' and ')} is missing`);
  const shown = parts.slice(0, 3).join('; ');
  const more = parts.length > 3 ? ` (and ${parts.length - 3} more)` : '';
  return `This order cannot be booked yet: ${shown}${more}. ${FIX}`;
}

/** The error every booking entry point raises for an incomplete order: a 422, stable code, and the field-level list. Nothing was sent to a courier. */
export function readinessError(issues: ReadinessIssue[]): Error & { statusCode: number; code: string; issues: ReadinessIssue[] } {
  return Object.assign(new Error(readinessSentence(issues)), { statusCode: 422, code: 'ORDER_NOT_READY', issues });
}

/** The one gate every booking path goes through: throws ORDER_NOT_READY (422, with field-level issues) when the order is incomplete. READY_SQL decides; the TypeScript rules only explain. */
export async function assertOrderReady(client: PoolClient, sellerId: string, orderId: string): Promise<void> {
  const r = await client.query<ReadinessFacts & { ready: boolean }>(
    `SELECT ${READY_SQL} AS ready, c.full_name, c.phone, c.address_line_1, c.pincode, c.city, c.state, o.total_weight_g, o.package_length_mm, o.package_width_mm, o.package_height_mm, o.payment_mode::text AS payment_mode, o.cod_amount_paise
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND o.seller_id = $2`, [orderId, sellerId]);
  const row = r.rows[0];
  if (!row) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  if (row.ready) return;
  const issues = readinessIssues(row);
  // The SQL said not ready: even if the explanation list came out empty (the two rules drifted apart), the order is still refused.
  throw readinessError(issues.length ? issues : [{ code: 'ORDER_INCOMPLETE', field: 'order', message: 'The order is incomplete.', action: 'Open the order and check every field.' }]);
}

export const READY_SQL = `(char_length(btrim(c.full_name)) >= 2 AND right(regexp_replace(c.phone, '\\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$' AND char_length(btrim(COALESCE(c.address_line_1, ''))) >= 3
                AND c.pincode ~ '^[0-9]{6}$' AND COALESCE(c.city, '') <> '' AND COALESCE(c.state, '') <> '' AND o.total_weight_g > 0
                AND o.package_length_mm IS NOT NULL AND o.package_width_mm IS NOT NULL AND o.package_height_mm IS NOT NULL
                AND (o.payment_mode <> 'cod' OR o.cod_amount_paise > 0))`;
