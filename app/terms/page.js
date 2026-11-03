import LegalPage from '@/components/legal/LegalPage';
import { terms } from '@/lib/legal/terms';

export const metadata = {
  title: 'Terms & Conditions',
  description: 'The terms that govern use of the NEXGO shipping platform: accounts and KYC, shipments, charges, COD, wallet, claims, liability and dispute resolution.',
  alternates: { canonical: '/terms' },
};

const HIGHLIGHTS = [
  'NEXGO is a technology platform: couriers are independent partners who carry and deliver your parcels.',
  'You are responsible for accurate addresses, declared contents, weight, dimensions and proper packaging.',
  'Charges follow the chargeable weight (higher of dead and volumetric); weight disputes can be raised with evidence.',
  'COD is remitted on your account’s cycle and may be held for disputes, incomplete KYC or fraud checks.',
  'Prohibited goods, fraud and misuse can lead to suspension; delivery dates are estimates, not guarantees.',
];

export default function Page() {
  return (
    <LegalPage
      doc={terms}
      slug="terms"
      highlights={HIGHLIGHTS}
      lead="The rules for using NEXGO to book, manage and track shipments through our courier partners."
    />
  );
}
