import LegalPage from '@/components/legal/LegalPage';
import { privacy } from '@/lib/legal/privacy';

export const metadata = {
  title: 'Privacy Policy',
  description: 'What information NEXGO collects, why, how it is shared with courier partners and payment providers, how it is protected, and the choices you have.',
  alternates: { canonical: '/privacy-policy' },
};

const HIGHLIGHTS = [
  'We collect account, KYC, shipment, payment and technical information only to run your shipping.',
  'Sender and receiver details are shared with the courier you choose so pickup and delivery can happen.',
  'Payment details are handled by the payment provider; NEXGO does not necessarily store full card or bank credentials.',
  'You can ask to access, correct or delete your information, withdraw consent, or raise a grievance.',
  'Merchants must have the right to share their customers’ details with NEXGO.',
];

export default function Page() {
  return (
    <LegalPage
      doc={privacy}
      slug="privacy-policy"
      highlights={HIGHLIGHTS}
      lead="How NEXGO collects, uses, shares and protects information handled through the website, dashboard, APIs and tracking pages."
    />
  );
}
