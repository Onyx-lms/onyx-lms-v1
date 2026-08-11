import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxPlatformShell } from '@/components/onyx-platform-shell';
import { CreateTenantForm } from '@/components/onyx-platform-forms';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';
import {
  ActionLink, DataTable, EmptyRow, StatTile, StatusDot,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Institutions' };

interface TenantRow {
  id: number; name: string; slug: string; status: number; plan: string | null;
  member_count: number; created_at: string;
}

/** Every institution on the platform, in one place -- what a tenant token can never show. */
export default async function OnyxPlatformPage() {
  const session = await requirePlatformSession();
  const tenants = await platformApi<TenantRow[]>('/api/onyx/platform/tenants');
  const suspended = tenants.filter((t) => t.status !== 1).length;
  const members = tenants.reduce((sum, t) => sum + Number(t.member_count), 0);

  return (
    <OnyxPlatformShell
      email={session.email}
      title="Institutions"
      subtitle={tenants.length === 1
        ? 'One institution on the platform.'
        : tenants.length + ' institutions on the platform.'}
      action={<CreateTenantForm />}
    >
      <div className="space-y-6">
        {/* Three numbers an operator checks before anything else: how many
            institutions there are, how many are switched off, and how many
            people are on the platform at all. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Institutions" value={tenants.length} />
          <StatTile label="Suspended" value={suspended}
            note={suspended ? 'not able to sign in' : 'all active'} />
          <StatTile label="Members" value={members} note="across every institution" />
        </div>

        <DataTable
          caption="Every institution on the platform"
          head={
            <>
              <th scope="col">Institution</th>
              <th scope="col">Address</th>
              <th scope="col">Members</th>
              <th scope="col">Created</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Open</span></th>
            </>
          }
        >
          {tenants.map((t) => (
            <tr key={t.id} className={t.status === 1 ? undefined : 'bg-red-50/40'}>
              <td>
                <Link href={'/onyx/platform/tenants/' + t.id}
                  className="font-semibold hover:underline">
                  {t.name}
                </Link>
              </td>
              <td className="font-mono text-[12.5px] text-muted">{t.slug}</td>
              <td className="tabular-nums">{t.member_count}</td>
              <td className="whitespace-nowrap text-muted">
                {new Date(t.created_at).toLocaleDateString(undefined,
                  { day: 'numeric', month: 'short', year: 'numeric' })}
              </td>
              <td><StatusDot on={t.status === 1} /></td>
              <td className="text-right">
                <ActionLink href={'/onyx/platform/tenants/' + t.id} label="Open" tone="quiet" />
              </td>
            </tr>
          ))}
          {tenants.length === 0 ? (
            <EmptyRow colSpan={6} icon="building">
              No institutions yet. Creating one seeds its roles and its first administrator.
            </EmptyRow>
          ) : null}
        </DataTable>
      </div>
    </OnyxPlatformShell>
  );
}
