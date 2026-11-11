import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import TrackForm from '@/components/track/TrackForm';
import '@/components/landing.css';
import '@/components/track/track.css';

export const metadata = {
  title: 'Track your parcel',
  description: 'Enter your tracking number (AWB) to see where your NEXGO parcel is, who is carrying it and when it is expected.',
  alternates: { canonical: '/track' },
};

export default function Page() {
  return (
    <div className="lp">
      <SiteHeader base="/" />
      <main>
        <section className="tk-hero">
          <div className="lp-wrap">
            <h1>Track your parcel</h1>
            <p>Enter the tracking number (AWB) from your shipping message to see where your parcel is and when it should arrive.</p>
            <TrackForm />
          </div>
        </section>
      </main>
      <SiteFooter base="/" />
    </div>
  );
}
