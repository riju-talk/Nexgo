import AuthScreen from '@/components/AuthScreen';

export const metadata = {
  title: 'Create your seller account',
  description: 'Register your business on NEXGO to ship with multiple couriers, manage NDR and RTO, and reconcile COD in one place.',
  alternates: { canonical: '/signup' },
};

export default function Page() {
  return <AuthScreen mode="signup" />;
}
