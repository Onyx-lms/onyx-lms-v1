import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { OnyxSignupForm } from '@/components/onyx-auth-forms';
import { getOnyxSession } from '@/lib/onyx-session';

export const metadata: Metadata = { title: 'Create an institution' };

export default async function OnyxSignupPage() {
  if (await getOnyxSession()) redirect('/onyx/dashboard');

  return (
    <AuthCard
      title="Create an institution"
      subtitle="An institution and its first administrator are set up together."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/onyx/login" className="text-brand-600 hover:underline">Sign in</Link>
        </>
      }
    >
      <OnyxSignupForm />
    </AuthCard>
  );
}
