import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { OnyxLoginForm } from '@/components/onyx-auth-forms';
import { getOnyxSession } from '@/lib/onyx-session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function OnyxLoginPage() {
  if (await getOnyxSession()) redirect('/onyx/dashboard');

  return (
    <AuthCard
      title="Sign in to Onyx"
      subtitle="Your account works across every institution you belong to."
      footer={
        <>
          Setting up a new institution?{' '}
          <Link href="/onyx/signup" className="text-brand-600 hover:underline">Start here</Link>
        </>
      }
    >
      <OnyxLoginForm />
    </AuthCard>
  );
}
