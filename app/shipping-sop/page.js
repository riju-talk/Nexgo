import LegalPage from '@/components/legal/LegalPage';
import { sop } from '@/lib/legal/sop';

export const metadata = {
  title: 'Shipping SOP',
  description: 'NEXGO shipping standard operating procedure: KYC, booking, pickup, packaging, weight rules, RTO, claims, COD remittance and escalation.',
  alternates: { canonical: '/shipping-sop' },
};

const HIGHLIGHTS = [
  'KYC is required before services such as COD are activated.',
  'Pack to suit the product, label clearly and use one AWB per package.',
  'Weight and size disputes need photos and must be raised within the dispute window.',
  'COD can be held for incomplete KYC, wrong bank details, negative wallet or dues.',
];

export default function Page() {
  return (
    <LegalPage
      doc={sop}
      slug="shipping-sop"
      highlights={HIGHLIGHTS}
      lead="How to prepare, hand over and manage a parcel, from KYC to COD remittance."
    />
  );
}
