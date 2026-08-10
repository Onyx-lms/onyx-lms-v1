import type { Metadata } from 'next';
import { OnyxPlatformShell } from '@/components/onyx-platform-shell';
import { SuspendToggle } from '@/components/onyx-platform-forms';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';

export const metadata: Metadata = { title: 'Institution' };

interface TenantDetail {
  id: number; name: string; slug: string; status: number; plan: string | null;
  created_at: string; members_by_role: Record<string, number>;
}

/** One institution's shape, as an operator sees it -- not as a member of it. */
export default async function OnyxPlatformTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformSession();
  const { id } = await params;
  const tenant = await platformApi<TenantDetail>('/api/onyx/platform/tenants/' + id);

  return (
    <OnyxPlatformShell
      email={session.email}
      title={tenant.name}
      subtitle={tenant.slug + (tenant.plan ? ' · ' + tenant.plan : '')}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className={'rounded-full px-2 py-0.5 text-xs ' + (tenant.status === 1
            ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
            {tenant.status === 1 ? 'active' : 'suspended'}
          </span>
          <SuspendToggle tenantId={tenant.id} suspended={tenant.status !== 1} />
        </div>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">People</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(tenant.members_by_role).map(([role, count]) => (
              <div key={role} className="rounded-2xl border border-line p-4">
                <div className="text-xs uppercase tracking-wide text-muted">{role}</div>
                <div className="mt-1 text-2xl font-semibold">{count}</div>
              </div>
            ))}
            {Object.keys(tenant.members_by_role).length === 0 ? (
              <p className="text-sm text-muted">Nobody has joined yet.</p>
            ) : null}
          </div>
        </section>

        <p className="text-xs text-muted">
          Created {new Date(tenant.created_at).toLocaleString()}
        </p>
      </div>
    </OnyxPlatformShell>
  );
}
