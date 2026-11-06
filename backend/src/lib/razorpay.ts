import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export type RazorpayOrder = { id: string; amountPaise: number; currency: 'INR'; keyId: string };

// Real Razorpay only. Without API keys a recharge is refused with a clear message: no pretend payment is ever created.
export async function createRazorpayOrder(amountPaise: number, receipt: string): Promise<RazorpayOrder> {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error('Online payments are not set up yet. Please contact support to recharge your wallet.'), { statusCode: 503, expose: true });
  }
  const auth = Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
  });
  if (!response.ok) throw Object.assign(new Error(`Razorpay order creation failed: ${response.status}`), { statusCode: 502 });
  const body = (await response.json()) as { id: string };
  return { id: body.id, amountPaise, currency: 'INR', keyId: config.RAZORPAY_KEY_ID };
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex'), 'hex');
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
