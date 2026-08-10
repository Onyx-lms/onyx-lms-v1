import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxPlatformShell } from '@/components/onyx-platform-shell';
import { CreateTenantForm } from '@/components/onyx-platform-forms';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';

export const metadata: Metadata = { title: 'Institutions' };

interface TenantRow {
  id: number; name: string; slug: string; status: number; plan: string | null;
  member_count: number; created_at: string;
}

/** Every institution on the platform, in one place -- what a tenant token can never show. */
export default async function OnyxPlatformPage() {
  const session = await requirePlatformSession();
  const tenants = await platformApi<TenantRow[]>('/api/onyx/platform/tenants');

  return (
    <OnyxPlatformShell
      email={session.email}
      title="Institutions"
      subtitle={tenants.length + ' on the platform.'}
    >
      <div className="space-y-6">
        <CreateTenantForm />

        <table className="w-full text-sm">
          <caption className="sr-only">Every institution on the platform</caption>
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th scope="col" className="py-1 pr-3">Name</th>
              <th scope="col" className="py-1 pr-3">Address</th>
              <th scope="col" className="py-1 pr-3">Members</th>
              <th scope="col" className="py-1 pr-3">Created</th>
              <th scope="col" className="py-1">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="py-2 pr-3">
                  <Link href={'/onyx/platform/tenants/' + t.id} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-slate-500">{t.slug}</td>
                <td className="py-2 pr-3 tabular-nums">{t.member_count}</td>
                <td className="py-2 pr-3 text-slate-500">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="py-2">
                  {t.status === 1
                    ? <span className="text-emerald-700">active</span>
                    : <span className="text-red-700">suspended</span>}
                </td>
              </tr>
            ))}
            {tenants.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-slate-500">
                No institutions yet.
              </td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </OnyxPlatformShell>
  );
}
