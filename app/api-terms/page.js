import LegalPage from '@/components/legal/LegalPage';
import { api } from '@/lib/legal/api';

export const metadata = {
  title: 'API Terms of Use',
  description: 'The terms for using NEXGO APIs, webhooks and developer tools: credentials, rate limits, webhooks, customer data, security testing and suspension.',
  alternates: { canonical: '/api-terms' },
};

const HIGHLIGHTS = [
  'Keep API keys and secrets private and report any leak immediately.',
  'Respect rate limits, use idempotency keys and expect webhook events to repeat.',
  'No scraping, circumvention or security testing without written approval.',
  'You must be authorised to send your customers’ data to NEXGO.',
];

export default function Page() {
  return (
    <LegalPage
      doc={api}
      slug="api-terms"
      highlights={HIGHLIGHTS}
      lead="The rules for integrating with NEXGO by API and webhooks."
    />
  );
}
