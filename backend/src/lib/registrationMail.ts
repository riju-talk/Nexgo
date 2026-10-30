import { config } from '../config.js';
import { sendMail } from './mailer.js';

// Registration is instant: the merchant is told, by e-mail, that they are registered. Nobody else is notified.
// Best effort (sendMail never throws): a mail outage must not undo a registration.
export async function sendRegistrationConfirmation(input: { businessName: string; fullName: string; email: string }) {
  await sendMail(input.email, 'You have been successfully registered on NEXGO',
    `Hi ${input.fullName},\n\nYou have been successfully registered on NEXGO. ${input.businessName} is ready to use.\n\nSign in any time at ${config.FRONTEND_ORIGIN}/login.\n\nIf you did not register, ignore this email.`);
}
