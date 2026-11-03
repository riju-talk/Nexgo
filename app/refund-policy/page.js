import LegalPage from '@/components/legal/LegalPage';
import { refund } from '@/lib/legal/refund';

export const metadata = {
  title: 'Refund & Cancellation Policy',
  description: 'When NEXGO shipments can be cancelled, which charges are refundable, how wallet credits and duplicate payments are handled, and how to request a refund.',
  alternates: { canonical: '/refund-policy' },
};

const HIGHLIGHTS = [
  'Cancel before pickup and eligible prepaid shipping charges are reversed or credited.',
  'After pickup, RTO, COD and weight-discrepancy charges generally stay payable.',
  'Failed bookings and duplicate payments are reversed, credited to the wallet or refunded after verification.',
  'Every request is reviewed; delays alone do not create an automatic refund, and promotional credits are not cash.',
];

export default function Page() {
  return (
    <LegalPage
      doc={refund}
      slug="refund-policy"
      highlights={HIGHLIGHTS}
      lead="When a shipment can be cancelled, what comes back to you and how to ask for a refund."
    />
  );
}
