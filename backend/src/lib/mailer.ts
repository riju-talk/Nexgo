import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Mailpit locally (compose.backend.yml exposes SMTP on 1025, a web UI to
// actually read the mail on 8025); a real ESP takes over via the same
// three env vars once one exists. No mail ever leaves localhost in dev.
// Short timeouts keep a serverless request from hanging on an unreachable SMTP host.
const transport = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: false,
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 8000,
});

// Mail is best effort: a missing or unreachable SMTP server must never turn a
// password reset or an invite into a 500 (the token is already stored). Returns whether it was sent.
export async function sendMail(to: string, subject: string, text: string) {
  try {
    await transport.sendMail({ from: 'NEXGO <no-reply@nexgo.local>', to, subject, text });
    return true;
  } catch (error) {
    console.error('Email could not be sent', { subject, reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
