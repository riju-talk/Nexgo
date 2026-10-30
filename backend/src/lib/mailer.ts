import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Mailpit locally (compose exposes SMTP on 1025 and a web UI on 8025); SES or any SMTP relay in
// production through SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_SECURE.
// Short timeouts keep a serverless request from hanging on an unreachable SMTP host.
const transport = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  // Gmail shows app passwords in groups ("abcd efgh ijkl mnop"); the spaces are not part of the password.
  auth: config.SMTP_USER ? { user: config.SMTP_USER.trim(), pass: (config.SMTP_PASSWORD ?? '').replace(/\s+/g, '') } : undefined,
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 8000,
});

// Mail is best effort: a missing or unreachable SMTP server must never turn a
// password reset or an invite into a 500 (the token is already stored). Returns whether it was sent.
export async function sendMail(to: string, subject: string, text: string) {
  try {
    await transport.sendMail({ from: config.MAIL_FROM, to, subject, text: `${text}\n\n--\nThe NEXGO team\n${config.FRONTEND_ORIGIN}` });
    return true;
  } catch (error) {
    console.error('Email could not be sent', { subject, reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
