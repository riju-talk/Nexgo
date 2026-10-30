import { Source_Sans_3, IBM_Plex_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { AppStateProvider } from '@/lib/AppStateContext';
import BootOverlay from '@/components/BootOverlay';
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from '@/lib/site';

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['multi-courier shipping', 'courier aggregator India', 'shipping rate calculator', 'order tracking', 'NDR management', 'COD remittance', 'e-commerce logistics'],
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', url: '/', title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: 'summary', title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
};

export const viewport = { themeColor: '#3877fc' };

// Structured data: tells search engines who runs the site.
const ORG_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  legalName: 'NEXGO Logistics Technologies Pvt. Ltd.',
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  areaServed: 'IN',
}).replace(/</g, '\\u003c');

const THEME_INIT = `
(function () {
  try {
    // The product always enters through its light operational workspace.
    // Dark mode is an in-session preference, selected deliberately from the sidebar.
    document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN" className={`${sourceSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORG_JSON_LD }} />
        <Script id="nx-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <AppStateProvider>{children}</AppStateProvider>
        <BootOverlay />
      </body>
    </html>
  );
}
