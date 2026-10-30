import AuthScreen from '@/components/AuthScreen';

export const metadata = { title: 'Reset your password', robots: { index: false, follow: false } };

export default function Page() {
  return <AuthScreen mode="forgot" />;
}
