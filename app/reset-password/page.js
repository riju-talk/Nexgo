import AuthScreen from '@/components/AuthScreen';

export const metadata = { title: 'Choose a new password', robots: { index: false, follow: false } };

export default function Page() {
  return <AuthScreen mode="reset" />;
}
