import { config } from '../config.js';
import { sendMail } from './mailer.js';

// Registration is instant: the merchant is told, by e-mail, that they are registered. Nobody else is notified.
// Best effort (sendMail never throws): a mail outage must not undo a registration.
export async function sendRegistrationConfirmation(input: { businessName: string; fullName: string; email: string }) {
  await sendMail(input.email, 'Welcome to NEXGO: you are registered',
    `Hi ${input.fullName},\n\nWelcome to NEXGO. You have been successfully registered and ${input.businessName} is ready to use.\n\nSign in any time at ${config.FRONTEND_ORIGIN}/login to compare courier rates, book shipments and track them in one place.\n\nIf you did not register on ${config.FRONTEND_ORIGIN.replace(/^https?:\/\//, '')}, you can ignore this email.`);
}
