import Link from 'next/link';
import './landing.css';

const ICON = { fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const FEATURES = [
  { title: 'Compare every courier', text: 'Live rates for any pincode pair, side by side. Pick the cheapest, the fastest, or let your own priority list decide.', icon: <path d="M4 7h16M4 12h10M4 17h16" /> },
  { title: 'Book in one click', text: 'Create orders by hand, upload a sheet of thousands, or sync a Shopify store. Labels and invoices print straight from the browser.', icon: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></> },
  { title: 'Track every parcel', text: 'One timeline per shipment, bulk AWB tracking, and clear tabs for pickup pending, in transit, delivered, lost and failed.', icon: <><circle cx="12" cy="10" r="3" /><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /></> },
  { title: 'Fix NDR and RTO fast', text: 'Re-attempt, change address or return, in bulk, and the courier is told. Nothing slips past the deadline unseen.', icon: <><path d="M3 12a9 9 0 109-9" /><path d="M3 4v5h5" /></> },
  { title: 'COD you can trust', text: 'Cash on delivery tracked from collection to your bank, with remittance cycles, wallet offsets and downloadable statements.', icon: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></> },
  { title: 'Wallet and GST, sorted', text: 'Every rupee is a ledger entry. Monthly GST invoices, credit notes and shipping charges export to Excel or CSV.', icon: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></> },
];

const STEPS = [
  { title: 'Create your account', text: 'Sign up with your business details. Our team verifies your KYC so you can start shipping.' },
  { title: 'Add orders', text: 'Connect your store, upload a spreadsheet or key one in. Bad addresses are flagged before they cost you.' },
  { title: 'Ship and settle', text: 'Choose a courier, print the label, watch it travel, and receive your COD on a clear schedule.' },
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Link href="/" className="lp-logo" aria-label="NEXGO home">
            <span className="lp-mark"><svg viewBox="0 0 24 24" {...ICON} strokeWidth={2.6}><path d="M6 19V5l12 14V5" /></svg></span>
            NEXGO
          </Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#money">COD &amp; billing</a>
          </nav>
          <div className="lp-cta">
            <Link href="/login" className="lp-btn ghost nav-signin">Sign in</Link>
            <Link href="/signup" className="lp-btn primary">Get started</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap">
            <div>
              <span className="lp-eyebrow">Multi-courier shipping platform</span>
              <h1>Ship anywhere. <em>One console.</em></h1>
              <p className="lp-sub">NEXGO gives Indian sellers every courier, every rate and every parcel in a single place, from the first order to the last COD rupee.</p>
              <div className="lp-hero-cta">
                <Link href="/signup" className="lp-btn primary big">Create free account</Link>
                <Link href="/login" className="lp-btn ghost big">Sign in</Link>
              </div>
              <div className="lp-proof"><span>No setup fee</span><span>Pay per shipment</span><span>Excel &amp; CSV everywhere</span></div>
            </div>

            <div className="lp-card" aria-hidden="true">
              <div className="lp-card-head"><span>Rate comparison</span><span className="lp-pill">SAMPLE</span></div>
              <div className="lp-route">Mumbai<i />Bengaluru</div>
              <div className="lp-meta">0.5 kg · Prepaid · Surface</div>
              <div className="lp-rates">
                <div className="lp-rate best"><span>Courier A<small>Cheapest · 3 days</small></span><b>₹52</b></div>
                <div className="lp-rate"><span>Courier B<small>Fastest · 2 days</small></span><b>₹64</b></div>
                <div className="lp-rate"><span>Courier C<small>4 days</small></span><b>₹58</b></div>
              </div>
              <div className="lp-track"><span className="on" /><span className="on" /><span className="on" /><span /></div>
              <div className="lp-track-label"><span>Booked</span><span>Picked up</span><span>In transit</span><span>Delivered</span></div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="features">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-eyebrow">What you get</span>
              <h2>Everything between &ldquo;order placed&rdquo; and &ldquo;cash received&rdquo;.</h2>
              <p className="lp-lead">Stop juggling courier portals and spreadsheets. NEXGO puts the whole shipping workflow behind one login.</p>
            </div>
            <div className="lp-grid">
              {FEATURES.map((f) => (
                <article className="lp-feature" key={f.title}>
                  <div className="lp-ico"><svg viewBox="0 0 24 24" {...ICON}>{f.icon}</svg></div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section alt" id="how">
          <div className="lp-wrap">
            <div className="lp-head">
              <span className="lp-eyebrow">How it works</span>
              <h2>Live in three steps.</h2>
            </div>
            <div className="lp-steps">
              {STEPS.map((s) => (
                <article className="lp-step" key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="money">
          <div className="lp-wrap lp-split">
            <div>
              <span className="lp-eyebrow">COD &amp; billing</span>
              <h2>Know where every rupee is.</h2>
              <p className="lp-lead">A ledger that never loses a paisa: freight, COD fees, refunds on cancellation and remittances, each one traceable.</p>
              <ul className="lp-list">
                <li>Wallet balance that matches the ledger, always</li>
                <li>COD remitted on a fixed cycle, with statements</li>
                <li>GST tax invoices and credit notes, ready to download</li>
                <li>Weight disputes resolved with a clear outcome</li>
              </ul>
            </div>
            <div className="lp-ledger" aria-hidden="true">
              <h4>Wallet ledger · sample</h4>
              <div className="lp-row"><span>Recharge</span><b className="pos">+ ₹10,000</b></div>
              <div className="lp-row"><span>Shipping charge</span><b className="neg">− ₹52</b></div>
              <div className="lp-row"><span>Cancellation refund</span><b className="pos">+ ₹52</b></div>
              <div className="lp-row"><span>COD remitted</span><b className="pos">+ ₹8,450</b></div>
            </div>
          </div>
        </section>

        <section className="lp-band">
          <div className="lp-wrap">
            <h2>Ship smarter, starting today.</h2>
            <p>Create your seller account in minutes and send your first parcel the same day.</p>
            <div className="lp-hero-cta">
              <Link href="/signup" className="lp-btn light big">Create free account</Link>
              <Link href="/login" className="lp-btn outline big">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span>© 2026 NEXGO Logistics Technologies Pvt. Ltd. · India</span>
          <nav aria-label="Footer"><Link href="/login">Sign in</Link><Link href="/signup">Create account</Link></nav>
        </div>
      </footer>
    </div>
  );
}
