import { describe, expect, it } from 'vitest';
import { readinessIssues, readinessSentence, readinessError, type ReadinessFacts } from '../../../src/lib/orderReadiness.js';

const ok = (over: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  full_name: 'Asha Rao', phone: '+91 98765 43210', address_line_1: '12 MG Road', pincode: '560001', city: 'Bengaluru', state: 'Karnataka',
  total_weight_g: 500, package_length_mm: 200, package_width_mm: 150, package_height_mm: 100, payment_mode: 'prepaid', cod_amount_paise: 0, ...over,
});
const codes = (f: ReadinessFacts) => readinessIssues(f).map((i) => i.code);

describe('order readiness (one rule for every booking path)', () => {
  it('a complete prepaid and a complete COD order have no issues', () => {
    expect(readinessIssues(ok())).toEqual([]);
    expect(readinessIssues(ok({ payment_mode: 'cod', cod_amount_paise: 89900 }))).toEqual([]);
  });

  it.each([
    ['name missing', { full_name: '' }, 'CUSTOMER_NAME_MISSING'],
    ['name one character', { full_name: 'A' }, 'CUSTOMER_NAME_MISSING'],
    ['name only spaces', { full_name: '   ' }, 'CUSTOMER_NAME_MISSING'],
    ['phone too short', { phone: '98765' }, 'CUSTOMER_PHONE_INVALID'],
    ['phone starts with 5', { phone: '5876543210' }, 'CUSTOMER_PHONE_INVALID'],
    ['phone missing', { phone: null }, 'CUSTOMER_PHONE_INVALID'],
    ['address too short', { address_line_1: 'ab' }, 'CUSTOMER_ADDRESS_MISSING'],
    ['address missing', { address_line_1: null }, 'CUSTOMER_ADDRESS_MISSING'],
    ['pincode five digits', { pincode: '56000' }, 'CUSTOMER_PINCODE_INVALID'],
    ['pincode letters', { pincode: '56O001' }, 'CUSTOMER_PINCODE_INVALID'],
    ['city missing', { city: '' }, 'CUSTOMER_CITY_MISSING'],
    ['state missing', { state: null }, 'CUSTOMER_STATE_MISSING'],
    ['weight zero', { total_weight_g: 0 }, 'WEIGHT_MISSING'],
    ['weight missing', { total_weight_g: null }, 'WEIGHT_MISSING'],
    ['length missing', { package_length_mm: null }, 'DIMENSION_MISSING'],
    ['width zero', { package_width_mm: 0 }, 'DIMENSION_MISSING'],
    ['height missing', { package_height_mm: null }, 'DIMENSION_MISSING'],
    ['COD without an amount', { payment_mode: 'cod', cod_amount_paise: 0 }, 'COD_AMOUNT_MISSING'],
    ['COD amount missing', { payment_mode: 'cod', cod_amount_paise: null }, 'COD_AMOUNT_MISSING'],
  ] as [string, Partial<ReadinessFacts>, string][])('%s -> %s', (_n, over, code) => {
    expect(codes(ok(over))).toContain(code);
  });

  it('a prepaid order does not need a COD amount, and a +91 / spaced phone is accepted', () => {
    expect(codes(ok({ payment_mode: 'prepaid', cod_amount_paise: null }))).toEqual([]);
    expect(codes(ok({ phone: '098765-43210' }))).toEqual([]); // the last ten digits decide
  });

  it('every issue carries a stable code, the field, a sentence and an action', () => {
    const issues = readinessIssues(ok({ total_weight_g: 0, package_length_mm: null, phone: '1' }));
    expect(issues.length).toBe(3);
    for (const i of issues) {
      expect(i.code).toMatch(/^[A-Z_]+$/);
      expect(i.field).toMatch(/\./);
      expect(i.message.length).toBeGreaterThan(20);
      expect(i.action.length).toBeGreaterThan(10);
    }
  });

  it('the error is a 422 with a code, the issues, and an actionable sentence (nothing internal)', () => {
    const e = readinessError(readinessIssues(ok({ total_weight_g: 0, package_length_mm: null, package_width_mm: null, package_height_mm: null })));
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('ORDER_NOT_READY');
    expect(e.issues).toHaveLength(4);
    expect(e.message).toMatch(/cannot be booked yet/);
    expect(e.message).toMatch(/package size \(length, width, height\) is missing/); // the three dimension issues are ONE problem for the seller
    expect(e.message).toMatch(/Track > Needs fixing/);
    expect(e.message.length).toBeLessThan(300); // sellerSafeMessage cuts at 300: the action must survive
    expect(e.message).not.toMatch(/lorrigo|shiprocket|sql|stack/i);
  });

  it('readinessSentence names each problem in plain words', () => {
    const s = readinessSentence(readinessIssues(ok({ total_weight_g: 0 })));
    expect(s).toMatch(/weight is missing/);
  });

  it('a long list is summarised, and the whole sentence stays inside the 300-character message cap with its action', () => {
    const s = readinessSentence(readinessIssues(ok({ full_name: '', phone: '1', address_line_1: '', pincode: '1', city: '', state: '', total_weight_g: 0, package_length_mm: null, package_width_mm: null, package_height_mm: null })));
    expect(s).toMatch(/and \d+ more/);
    expect(s.length).toBeLessThan(300);
    expect(s).toMatch(/Track > Needs fixing/);
  });
});
