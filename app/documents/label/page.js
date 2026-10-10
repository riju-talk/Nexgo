import { Suspense } from 'react';
import DocumentViewer from '@/components/documents/DocumentViewer';

export const metadata = { title: 'NEXGO: label' };

export default function Page() {
  return <Suspense fallback={null}><DocumentViewer kind="label" /></Suspense>;
}
