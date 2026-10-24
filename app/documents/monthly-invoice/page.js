import { Suspense } from 'react';
import MonthlyInvoiceViewer from '@/components/documents/MonthlyInvoiceViewer';

export const metadata = { title: 'NEXGO: tax invoice' };

export default function Page() {
  return <Suspense fallback={null}><MonthlyInvoiceViewer /></Suspense>;
}
