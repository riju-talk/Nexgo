import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { COMPANY, POLICIES } from '@/lib/legal/company';
import '@/components/landing.css';
import './legal.css';


// Replaces a known [PLACEHOLDER] with the configured company detail, or highlights it so it is not missed.
function Rich({ text }) {
  return text.split(/(\[[A-Z][^\]]*\])/).map((part, i) => {
    if (!/^\[[A-Z][^\]]*\]$/.test(part)) return part;
    const v = COMPANY[part];
    if (v) return v.includes('@') ? <a key={i} href={`mailto:${v}`}>{v}</a> : v;
    return <mark className="lg-blank" key={i} title="Detail still to be provided">{part}</mark>;
  });
}

const KEEP = new Set(['NEXGO', 'COD', 'API', 'KYC', 'GST', 'NDR', 'RTO', 'AWB', 'POD', 'SOP', 'ODA', 'NSZ', 'TAT']);
const SMALL = new Set(['and', 'of', 'to', 'for', 'from', 'with', 'in', 'on', 'a', 'the']);
// Section titles in the privacy policy are ALL CAPS; show them in title case (acronyms kept).
function niceTitle(t) {
  if (t !== t.toUpperCase()) return t;
  return t.split(' ').map((w, i) => {
    if (KEEP.has(w)) return w;
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.replace(/(^|-)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  }).join(' ');
}

function Block({ b }) {
  switch (b.t) {
    case 'p': return <p><Rich text={b.text} /></p>;
    case 'h': return <h3><Rich text={b.text} /></h3>;
    case 'ul': return <ul>{b.items.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ul>;
    case 'ol': return <ol>{b.items.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ol>;
    case 'kv':
      return (
        <dl className="lg-kv">
          {b.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><Rich text={v} /></dd></div>)}
        </dl>
      );
    case 'table':
      return (
        <div className="lg-table-wrap">
          <table>
            <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    default: return null;
  }
}

/**
 * doc: { title, effective, updated, intro[], sections[{n,title,blocks[]}] } from lib/legal/*.
 * highlights: 3-4 plain-language points shown above the full text (a summary, not a replacement).
 */
export default function LegalPage({ doc, slug, highlights = [], lead }) {
  const others = POLICIES.filter((p) => p.href !== `/${slug}`);
  return (
    <div className="lp">
      <SiteHeader base="/" />
      <main>
        <section className="lg-hero">
          <div className="lp-wrap">
            <nav className="lg-crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>{doc.title}</span></nav>
            <h1>{doc.title}</h1>
            {lead ? <p className="lp-sub">{lead}</p> : null}
            <p className="lg-dates">Effective {doc.effective} · Last updated {doc.updated}</p>
          </div>
        </section>

        <div className="lp-wrap lg-body">
          <aside className="lg-toc" aria-label="Contents">
            <details className="lg-toc-box" open>
              <summary>On this page</summary>
              <ol>
                {doc.sections.map((s) => (
                  <li key={s.n}><a href={`#s-${s.n}`}><span>{s.n}</span>{niceTitle(s.title)}</a></li>
                ))}
              </ol>
            </details>
          </aside>

          <article className="lg-doc">
            {highlights.length > 0 && (
              <div className="lg-glance">
                <h2>At a glance</h2>
                <ul>{highlights.map((h) => <li key={h}>{h}</li>)}</ul>
                <small>A short summary for convenience. The full text below is what applies.</small>
              </div>
            )}

            <div className="lg-intro">{doc.intro.map((p, i) => <Block key={i} b={p} />)}</div>

            {doc.sections.map((s) => (
              <section key={s.n} id={`s-${s.n}`} className="lg-sec">
                <h2><span>{s.n}</span>{niceTitle(s.title)}</h2>
                {s.blocks.map((b, i) => <Block key={i} b={b} />)}
              </section>
            ))}

            <aside className="lg-more">
              <h2>Related policies</h2>
              <div>
                {others.map((p) => <Link key={p.href} href={p.href}>{p.label}<span aria-hidden="true">→</span></Link>)}
              </div>
            </aside>
          </article>
        </div>
      </main>
      <SiteFooter base="/" />
    </div>
  );
}
