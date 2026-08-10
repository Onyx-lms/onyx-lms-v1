import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Not available' };

export default function OnyxDenied() {
  return (
    <div className="container-page py-16 text-center">
      <h1 className="text-2xl font-semibold">That is not part of your role here</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your role in this institution does not include that page. If you also belong to
        another institution, switching may change what you can reach.
      </p>
      <Link href="/onyx/dashboard" className="mt-6 inline-block text-sm text-brand-600 hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}
