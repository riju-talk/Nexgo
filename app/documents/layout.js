// Printable labels and invoices: never indexed.
export const metadata = { robots: { index: false, follow: false } };

export default function DocumentsLayout({ children }) {
  return children;
}
