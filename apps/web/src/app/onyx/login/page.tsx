import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { OnyxLoginForm } from '@/components/onyx-auth-forms';
import { OnyxBrand } from '@/components/onyx-brand';
import { getOnyxSession } from '@/lib/onyx-session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function OnyxLoginPage() {
  if (await getOnyxSession()) redirect('/onyx/dashboard');

  return (
    <AuthCard
      logo={<OnyxBrand className="mb-6" />}
      title="Sign in to Onyx"
      subtitle="Your account works across every institution you belong to."
      footer={
        <>
          Setting up a new institution?{' '}
          {/* WCAG 1.4.1: a link inside a sentence cannot rely on colour alone
              to be distinguishable, and brand-600 on this background is only
              1.17:1 against the surrounding text -- nowhere near the 3:1 a
              colour-only distinction would need. Underlined unconditionally
              rather than only on hover, which is what a mouse user never sees
              until it is too late to matter. */}
          <Link href="/onyx/signup" className="text-brand-600 underline">Start here</Link>
        </>
      }
    >
      <OnyxLoginForm />
    </AuthCard>
  );
}
