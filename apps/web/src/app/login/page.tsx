import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { AuthForm } from '@/components/auth-form';
import { getSession, homeForRole } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeForRole(session.app_role));

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back. Enter your details to continue."
      footer={
        <>
          Do not have an account?{' '}
          <Link href="/register" className="text-brand-600 hover:underline">Create one</Link>
        </>
      }
    >
      <AuthForm
        action="login"
        submitLabel="Sign in"
        fields={[
          { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
          { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
        ]}
      />
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-slate-600 hover:text-brand-600">
          Forgot your password?
        </Link>
      </p>
    </AuthCard>
  );
}
