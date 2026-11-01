import Link from 'next/link';
import Image from 'next/image';
import { Manrope } from 'next/font/google';
import './landing.css';

const display = Manrope({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display' });

// Shared stroke style for the inline line icons (colour comes from CSS `currentColor`).
const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Icon({ children, size = 22 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} {...ICON} aria-hidden="true">{children}</svg>;
}

const I = {
  rates: <><path d="M4 7h16M4 12h10M4 17h16" /></>,
  box: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></>,
  pin: <><circle cx="12" cy="10" r="3" /><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /></>,
  undo: <><path d="M3 12a9 9 0 109-9" /><path d="M3 4v5h5" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  sheet: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>,
  store: <><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9a2.5 2.5 0 005 0 2.5 2.5 0 006 0 2.5 2.5 0 005 0" /><path d="M5 12v8h14v-8" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  check: <><path d="M6 12.5l4 4 8-9" /></>,
};

const CAPABILITIES = [
  { icon: I.store, title: 'Shopify sync', text: 'Orders flow in; tracking flows back.' },
  { icon: I.upload, title: 'Bulk upload', text: 'Thousands of orders from one sheet.' },
  { icon: I.print, title: 'Labels & invoices', text: '4×6 labels and GST invoices to print.' },
  { icon: I.pin, title: 'Bulk tracking', text: 'Up to 500 AWBs in a single paste.' },
  { icon: I.sheet, title: 'Excel & CSV', text: 'Every report and statement exports.' },
];

const STEPS = [
  { title: 'Create your account', text: 'Sign up with your business details and complete KYC. You land straight in your workspace.' },
  { title: 'Add orders', text: 'Connect Shopify, upload a spreadsheet or key one in. Bad addresses are flagged before they cost you.' },
  { title: 'Ship and settle', text: 'Choose a courier, print the label, watch it travel and receive your COD on a clear schedule.' },
];

const FAQ = [
  { q: 'Who is NEXGO for?', a: 'Indian online sellers and brands that ship domestic parcels, prepaid or cash on delivery, and want every courier, rate and shipment in one place instead of a separate portal per courier.' },
  { q: 'How do I get couriers and rates?', a: 'Once you have signed up, NEXGO sets up the couriers and the rate card on your account. You can read the rate card under Tools and compare live prices for any pincode pair with the rate calculator.' },
  { q: 'How can I add orders?', a: 'Three ways: create one by hand, upload an Excel or CSV sheet with thousands of rows, or connect your Shopify store and let orders sync in. Rows with a problem are listed with the reason, and you can download, fix and re-upload them.' },
  { q: 'How does COD reach my bank?', a: 'The courier collects the cash, and NEXGO remits it on a fixed cycle set for your account, with a downloadable statement for each remittance. If your wallet is negative, that amount is recovered from the COD first and the statement shows it.' },
  { q: 'What happens when a delivery fails?', a: 'Failed attempts open an NDR case. Choose re-attempt, change address or return, singly or in bulk, and the decision is passed to the courier so nothing slips past the deadline.' },
  { q: 'Do I get GST invoices?', a: 'Yes. Tax invoices split IGST or CGST + SGST by state, and monthly invoices, credit notes and shipping charges export to Excel or CSV for your accountant.' },
];

const FAQ_JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
}).replace(/</g, '\\u003c');

function Logo({ light }) {
  return (
    <Link href="/" className={`lp-logo${light ? ' light' : ''}`} aria-label="NEXGO home">
      {light ? (
        <>
          <span className="lp-mark"><Image src="/nexgo-mark.png" alt="" width={428} height={364} /></span>
          NEXGO
        </>
      ) : (
        <Image src="/nexgo-logo.png" alt="NEXGO" width={1757} height={364} priority className="lp-logo-img" />
      )}
    </Link>
  );
}

export default function Landing() {
  return (
    <div className={`lp ${display.variable}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }} />

      <header className="lp-nav">
        <div className="lp-wrap">
          <Logo />
          <nav className="lp-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#money">COD &amp; billing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-cta">
            <Link href="/login" className="lp-btn ghost nav-signin">Sign in</Link>
            <Link href="/signup" className="lp-btn primary">Get started</Link>
            <details className="lp-menu">
              <summary aria-label="Open menu"><Icon>{I.menu}</Icon></summary>
              <div className="lp-menu-panel">
                <a href="#features">Features</a>
                <a href="#how">How it works</a>
                <a href="#money">COD &amp; billing</a>
                <a href="#faq">FAQ</a>
                <Link href="/login">Sign in</Link>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-dots" aria-hidden="true" />
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <Link href="/signup" className="lp-chip">
                <b>New</b> Bulk AWB tracking for up to 500 parcels
                <Icon size={15}>{I.arrow}</Icon>
              </Link>
              <h1>Ship anywhere from <em>one console.</em></h1>
              <p className="lp-sub">NEXGO gives Indian sellers every courier, every rate and every parcel in a single place, from the first order to the last COD rupee.</p>
              <div className="lp-hero-cta">
                <Link href="/signup" className="lp-btn primary big">Create free account <Icon size={18}>{I.arrow}</Icon></Link>
                <Link href="/login" className="lp-btn ghost big">Sign in</Link>
              </div>
              <ul className="lp-proof">
                <li>No setup fee</li>
                <li>Pay per shipment</li>
                <li>Excel &amp; CSV everywhere</li>
              </ul>
            </div>

            {/* Product mockup. Decorative, every figure is sample data. */}
            <div className="lp-stage" aria-hidden="true">
              <div className="lp-window">
                <div className="lp-win-bar">
                  <span /><span /><span />
                  <em>Dashboard</em>
                  <small>SAMPLE DATA</small>
                </div>
                <div className="lp-win-body">
                  <aside className="lp-win-side">
                    <i className="on" /><i /><i /><i /><i />
                  </aside>
                  <div className="lp-win-main">
                    <div className="lp-kpis">
                      <div><small>Orders today</small><b>128</b></div>
                      <div><small>In transit</small><b>342</b></div>
                      <div><small>COD pending</small><b>₹1.2L</b></div>
                    </div>
                    <div className="lp-chart">
                      <div className="lp-chart-head"><span>Shipments · last 7 days</span><span className="lp-legend"><i />Prepaid<i className="b" />COD</span></div>
                      <div className="lp-bars">
                        {[[46, 22], [58, 30], [40, 26], [66, 34], [52, 28], [74, 38], [62, 32]].map(([a, b], i) => (
                          <div key={i}><span className="p" style={{ height: `${a}%` }} /><span className="c" style={{ height: `${b}%` }} /></div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lp-float lp-float-rates">
                <div className="lp-card-head"><span>Rate comparison</span><span className="lp-pill">SAMPLE</span></div>
                <div className="lp-route">Mumbai<i />Bengaluru</div>
                <div className="lp-meta">0.5 kg · Prepaid · Surface</div>
                <div className="lp-rates">
                  <div className="lp-rate best"><span>Courier A<small>Cheapest · 3 days</small></span><b>₹52</b></div>
                  <div className="lp-rate"><span>Courier B<small>Fastest · 2 days</small></span><b>₹64</b></div>
                  <div className="lp-rate"><span>Courier C<small>4 days</small></span><b>₹58</b></div>
                </div>
              </div>

              <div className="lp-float lp-float-track">
                <div className="lp-track-top"><span className="lp-dot-live" />Out for delivery</div>
                <div className="lp-track"><span className="on" /><span className="on" /><span className="on" /><span /></div>
                <div className="lp-track-label"><span>Booked</span><span>Picked up</span><span>In transit</span><span>Delivered</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* CAPABILITY STRIP */}
        <section className="lp-strip" aria-label="Highlights">
          <div className="lp-wrap">
            {CAPABILITIES.map((c) => (
              <div key={c.title}>
                <span className="lp-strip-ico"><Icon size={20}>{c.icon}</Icon></span>
                <b>{c.title}</b>
                <small>{c.text}</small>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES BENTO */}
        <section className="lp-section" id="features">
          <div className="lp-wrap">
            <div className="lp-head center">
              <span className="lp-eyebrow">What you get</span>
              <h2>Everything between &ldquo;order placed&rdquo; and &ldquo;cash received&rdquo;.</h2>
              <p className="lp-lead">Stop juggling courier portals and spreadsheets. NEXGO puts the whole shipping workflow behind one login.</p>
            </div>

            <div className="lp-bento">
              <article className="lp-tile t-rates">
                <div className="lp-ico"><Icon>{I.rates}</Icon></div>
                <h3>Compare every courier</h3>
                <p>Live rates for any pincode pair, side by side. Pick the cheapest, the fastest, or let your own priority list decide.</p>
                <div className="lp-mini lp-mini-table" aria-hidden="true">
                  <div className="h"><span>Courier</span><span>Delivery</span><span>Price</span></div>
                  <div className="best"><span>Courier A <em>Cheapest</em></span><span>3 days</span><b>₹52</b></div>
                  <div><span>Courier B <em className="f">Fastest</em></span><span>2 days</span><b>₹64</b></div>
                  <div><span>Courier C</span><span>4 days</span><b>₹58</b></div>
                </div>
              </article>

              <article className="lp-tile t-book">
                <div className="lp-ico"><Icon>{I.box}</Icon></div>
                <h3>Book in one click</h3>
                <p>Create orders by hand, upload a sheet of thousands, or sync a Shopify store. Labels and invoices print from the browser.</p>
                <div className="lp-mini lp-mini-upload" aria-hidden="true">
                  <div className="file"><Icon size={18}>{I.sheet}</Icon><span>orders.xlsx</span><b>Uploaded</b></div>
                  <div className="meter"><span /></div>
                  <div className="cap"><span>Valid orders created</span><span>Failed rows listed with reasons</span></div>
                </div>
              </article>

              <article className="lp-tile t-track">
                <div className="lp-ico"><Icon>{I.pin}</Icon></div>
                <h3>Track every parcel</h3>
                <p>One timeline per shipment, bulk AWB tracking, and clear tabs for pickup pending, in transit, delivered and lost.</p>
                <ol className="lp-mini lp-mini-timeline" aria-hidden="true">
                  <li className="done"><b>Delivered</b><small>Bengaluru</small></li>
                  <li className="done"><b>Out for delivery</b><small>Bengaluru hub</small></li>
                  <li><b>In transit</b><small>Mumbai to Bengaluru</small></li>
                </ol>
              </article>

              <article className="lp-tile t-ndr">
                <div className="lp-ico"><Icon>{I.undo}</Icon></div>
                <h3>Fix NDR and RTO fast</h3>
                <p>Re-attempt, change address or return, in bulk. The courier is told, so nothing slips past the deadline.</p>
                <div className="lp-mini lp-mini-chips" aria-hidden="true">
                  <span className="on">Re-attempt</span><span>Change address</span><span>Return</span>
                </div>
              </article>

              <article className="lp-tile t-cod">
                <div className="lp-ico"><Icon>{I.cash}</Icon></div>
                <h3>COD you can trust</h3>
                <p>Cash on delivery tracked from collection to your bank, with remittance cycles and downloadable statements.</p>
                <div className="lp-mini lp-mini-cod" aria-hidden="true">
                  <div><small>Collected</small><b>₹10,000</b></div>
                  <div><small>Remitted on cycle</small><b>₹8,450</b></div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="lp-section alt" id="how">
          <div className="lp-wrap">
            <div className="lp-head center">
              <span className="lp-eyebrow">How it works</span>
              <h2>Live in three steps.</h2>
            </div>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li className="lp-step" key={s.title}>
                  <span className="lp-num">0{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* MONEY */}
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
              <Link href="/signup" className="lp-link">Start shipping <Icon size={18}>{I.arrow}</Icon></Link>
            </div>
            <div className="lp-ledger" aria-hidden="true">
              <div className="lp-ledger-head"><h4>Wallet ledger</h4><span className="lp-pill dark">SAMPLE</span></div>
              <div className="lp-bal"><small>Balance</small><b>₹18,450</b></div>
              <div className="lp-row"><span>Recharge</span><b className="pos">+ ₹10,000</b></div>
              <div className="lp-row"><span>Shipping charge</span><b className="neg">− ₹52</b></div>
              <div className="lp-row"><span>Cancellation refund</span><b className="pos">+ ₹52</b></div>
              <div className="lp-row"><span>COD remitted</span><b className="pos">+ ₹8,450</b></div>
            </div>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section className="lp-section tight">
          <div className="lp-wrap lp-trio">
            <div><div className="lp-ico soft"><Icon>{I.shield}</Icon></div><h3>Your data stays yours</h3><p>Each seller sees only their own orders, wallet and customers, enforced in the database itself.</p></div>
            <div><div className="lp-ico soft"><Icon>{I.receipt}</Icon></div><h3>Built for Indian GST</h3><p>IGST or CGST + SGST split by state, sequential invoice numbers, credit notes and TDS in one place.</p></div>
            <div><div className="lp-ico soft"><Icon>{I.sheet}</Icon></div><h3>Download anything</h3><p>Every report, statement and failed-order file comes as Excel or CSV, ready for your accountant.</p></div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section alt" id="faq">
          <div className="lp-wrap lp-faq-wrap">
            <div className="lp-head">
              <span className="lp-eyebrow">FAQ</span>
              <h2>Questions, answered.</h2>
              <p className="lp-lead">Not here? Create an account and our team will help you get set up.</p>
            </div>
            <div className="lp-faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}<span aria-hidden="true" /></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA BAND */}
        <section className="lp-band">
          <div className="lp-wrap">
            <h2>Ship smarter, starting today.</h2>
            <p>Create your seller account in minutes and send your first parcel the same day.</p>
            <div className="lp-hero-cta">
              <Link href="/signup" className="lp-btn light big">Create free account <Icon size={18}>{I.arrow}</Icon></Link>
              <Link href="/login" className="lp-btn outline big">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-grid">
          <div>
            <Logo />
            <p>Multi-courier shipping, COD and billing for Indian sellers.</p>
          </div>
          <nav aria-label="Product">
            <h5>Product</h5>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#money">COD &amp; billing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav aria-label="Account">
            <h5>Account</h5>
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Create account</Link>
            <Link href="/forgot-password">Forgot password</Link>
          </nav>
        </div>
        <div className="lp-wrap lp-legal">© 2026 NEXGO Logistics Technologies Pvt. Ltd. · India</div>
      </footer>
    </div>
  );
}
