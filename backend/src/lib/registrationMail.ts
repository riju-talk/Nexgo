import { db } from '../db/client.js';
import { config } from '../config.js';
import { sendMail } from './mailer.js';

// Everyone who should hear about a new registration: ADMIN_NOTIFY_EMAIL if set, otherwise every platform admin on file.
async function adminRecipients(): Promise<string[]> {
  const configured = config.ADMIN_NOTIFY_EMAIL.split(',').map((e) => e.trim()).filter(Boolean);
  if (configured.length) return configured;
  const rows = await db.query<{ email: string }>('SELECT u.email FROM platform_admins pa JOIN users u ON u.id = pa.user_id');
  return rows.rows.map((r) => r.email);
}

export async function notifyRegistrationReceived(input: { businessName: string; fullName: string; email: string }) {
  const admins = await adminRecipients().catch(() => []);
  await Promise.all([
    ...admins.map((to) => sendMail(to, `New seller registration: ${input.businessName}`,
      `${input.fullName} <${input.email}> registered ${input.businessName} and is waiting for approval.\n\nReview it in the admin panel: ${config.FRONTEND_ORIGIN}/admin/registrations`)),
    sendMail(input.email, 'We received your NEXGO registration',
      `Hi ${input.fullName},\n\nThanks for registering ${input.businessName} on NEXGO. Our team reviews every new account. You will get another email as soon as it is approved, and then you can sign in.\n\nIf you did not register, ignore this email.`),
  ]);
}

export async function notifyRegistrationDecision(input: { email: string; fullName: string; businessName: string; approved: boolean; reason?: string }) {
  if (input.approved) {
    return sendMail(input.email, 'Your NEXGO account is approved',
      `Hi ${input.fullName},\n\nGood news: ${input.businessName} has been approved on NEXGO. You can sign in now:\n${config.FRONTEND_ORIGIN}/login`);
  }
  return sendMail(input.email, 'Your NEXGO registration was not approved',
    `Hi ${input.fullName},\n\nWe could not approve the registration for ${input.businessName}.${input.reason ? `\n\nReason: ${input.reason}` : ''}\n\nReply to this email if you think this is a mistake.`);
}
