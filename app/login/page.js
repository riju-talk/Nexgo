import AuthScreen from '@/components/AuthScreen';

export const metadata = {
  title: 'Sign in',
  description: 'Sign in to your NEXGO seller console to compare courier rates, book shipments and track every order.',
  alternates: { canonical: '/login' },
};

export default function Page() {
  return <AuthScreen mode="login" />;
}
