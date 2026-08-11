import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxPlatformShell } from '@/components/onyx-platform-shell';
import { SuspendToggle } from '@/components/onyx-platform-forms';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';
import { Card, Empty, SectionHead, StatTile, StatusDot } from '@/components/onyx-ui';

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
  const total = Object.values(tenant.members_by_role).reduce((sum, n) => sum + n, 0);

  return (
    <OnyxPlatformShell
      email={session.email}
      title={tenant.name}
      subtitle={total + (total === 1 ? ' member' : ' members')}
    >
      <div className="space-y-6">
        <Link href="/onyx/platform"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted
                     hover:text-brand-700 hover:underline">
          &larr; Every institution
        </Link>

        {/* Suspension is the one destructive thing this console does, so it
            sits in its own card with the current state next to it rather than
            as a loose button under a heading. A suspended institution is a
            customer nobody can sign in to, and the screen should feel like it. */}
        <Card className={'flex flex-wrap items-center justify-between gap-4 p-4 '
          + (tenant.status === 1 ? '' : 'border-red-300 bg-red-50/60')}>
          <div>
            <StatusDot on={tenant.status === 1} />
            <p className="mt-1 text-[13px] text-muted">
              {tenant.status === 1
                ? 'Everyone at this institution can sign in.'
                : 'Nobody at this institution can sign in. Their data is untouched.'}
            </p>
          </div>
          <SuspendToggle tenantId={tenant.id} suspended={tenant.status !== 1} />
        </Card>

        <section>
          <SectionHead title={'People \u00b7 ' + total} />
          {Object.keys(tenant.members_by_role).length === 0 ? (
            <Card className="p-2">
              <Empty icon="users">Nobody has joined this institution yet.</Empty>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(tenant.members_by_role)
                .sort((a, b) => b[1] - a[1])
                .map(([role, count]) => (
                  <StatTile key={role} label={role} value={count} />
                ))}
            </div>
          )}
        </section>

        <Card className="p-4">
          <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                Address
              </dt>
              <dd className="mt-0.5 font-mono">{tenant.slug}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                Plan
              </dt>
              <dd className="mt-0.5">{tenant.plan ?? 'None recorded'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
                Created
              </dt>
              <dd className="mt-0.5">
                {new Date(tenant.created_at).toLocaleDateString(undefined,
                  { day: 'numeric', month: 'long', year: 'numeric' })}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </OnyxPlatformShell>
  );
}
