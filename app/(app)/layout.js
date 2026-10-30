import AppShell from '@/components/AppShell';

// The signed-in seller console: never indexed.
export const metadata = { robots: { index: false, follow: false } };

export default function AppGroupLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
