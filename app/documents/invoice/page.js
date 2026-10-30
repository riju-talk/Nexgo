import { Suspense } from 'react';
import DocumentViewer from '@/components/documents/DocumentViewer';

export const metadata = { title: { absolute: 'NEXGO: invoice' } };

export default function Page() {
  return <Suspense fallback={null}><DocumentViewer kind="invoice" /></Suspense>;
}
