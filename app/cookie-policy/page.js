import LegalPage from '@/components/legal/LegalPage';
import { cookies } from '@/lib/legal/cookies';

export const metadata = {
  title: 'Cookie Policy',
  description: 'How NEXGO uses cookies and similar technologies on its website, merchant dashboard and tracking pages, and how to manage your choices.',
  alternates: { canonical: '/cookie-policy' },
};

const HIGHLIGHTS = [
  'Essential cookies keep you signed in and your account secure; they cannot be switched off.',
  'Functional, analytics, performance and marketing cookies are optional, where used.',
  'You can change optional choices later and control cookies in your browser settings.',
  'Blocking all cookies can stop parts of the dashboard from working.',
];

export default function Page() {
  return (
    <LegalPage
      doc={cookies}
      slug="cookie-policy"
      highlights={HIGHLIGHTS}
      lead="What cookies are, which ones NEXGO uses and the choices you have."
    />
  );
}
