import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import TrackForm from '@/components/track/TrackForm';
import TrackResult from '@/components/track/TrackResult';
import '@/components/landing.css';
import '@/components/track/track.css';

// A single parcel is private to whoever has its number: kept out of search engines.
export const metadata = {
  title: 'Parcel tracking',
  robots: { index: false, follow: false },
};

export default async function Page({ params }) {
  const { awb } = await params;
  const clean = decodeURIComponent(awb).slice(0, 40);
  return (
    <div className="lp">
      <SiteHeader base="/" />
      <main>
        <section className="tk-hero">
          <div className="lp-wrap">
            <h1>Track your parcel</h1>
            <TrackForm initial={clean} />
          </div>
        </section>
        <div className="lp-wrap tk-body"><TrackResult awb={clean} /></div>
      </main>
      <SiteFooter base="/" />
    </div>
  );
}
