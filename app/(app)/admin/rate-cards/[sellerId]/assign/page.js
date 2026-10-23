import AppPage from '@/components/AppPage';

export default async function Page({ params }) {
  const { sellerId } = await params;
  return <AppPage id="a-rate-assign" sellerId={sellerId} />;
}
