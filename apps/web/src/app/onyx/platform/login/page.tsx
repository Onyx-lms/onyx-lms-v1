import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { OnyxBrand } from '@/components/onyx-brand';
import { PlatformLoginForm } from '@/components/onyx-platform-forms';
import { getPlatformSession } from '@/lib/onyx-platform-session';

export const metadata: Metadata = { title: 'Platform sign in' };

/**
 * A separate door from /onyx/login on purpose. A platform admin is not
 * signing in to an institution -- there is no tenant picker here, and no
 * tenant to land in. See onyx-platform-session.ts for why the two sessions
 * do not share a cookie or a claims shape.
 */
export default async function OnyxPlatformLoginPage() {
  if (await getPlatformSession()) redirect('/onyx/platform');

  return (
    <AuthCard
      logo={<OnyxBrand className="mb-6" />}
      title="Platform console"
      subtitle="For operators, not for any one institution."
    >
      <PlatformLoginForm />
    </AuthCard>
  );
}
