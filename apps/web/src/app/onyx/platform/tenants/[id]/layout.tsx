import Link from 'next/link';
import { OnyxPlatformShell } from '@/components/onyx-platform-shell';
import { TenantSidebarNav } from '@/components/onyx-platform-tenant-nav';
import { SuspendToggle, TenantEditForm, DeleteTenantButton } from '@/components/onyx-platform-forms';
import { requirePlatformSession, platformApi } from '@/lib/onyx-platform-session';
import type { TenantDetail } from '@/lib/onyx-platform-tenant';
import { plural } from '@/lib/onyx-platform-tenant';
import { Card, Icon, StatusDot } from '@/components/onyx-ui';

/**
 * Shared chrome for every `/onyx/platform/tenants/[id]/...` page: the
 * identity card (who this institution is, whether it can sign in, the
 * destructive controls) in the main content, and -- in the shell's own left
 * sidebar, via `sidebarNav` -- the grouped nav that replaced one long
 * scrolling page with Overview/Students/Faculty/Courses/Assignments/
 * Examinations/Assessments/Grades/Fees as their own routes, navigated the
 * same way every tenant-side role already navigates (OnyxShell's NavGroup).
 *
 * The tenant read is fetched here, once, for the identity card and the nav's
 * institution name -- each child page still reads its own section data
 * independently (a Next layout cannot hand a server-fetched value to a page
 * except through this file's own children prop, and every section already
 * degrades to its own "could not load" banner on a failed read, which a
 * shared fetch would not preserve).
 */
export default async function OnyxPlatformTenantLayout(
  { params, children }: { params: Promise<{ id: string }>; children: React.ReactNode },
) {
  const session = await requirePlatformSession();
  const { id } = await params;
  const tenant = await platformApi<TenantDetail>(
    '/api/onyx/platform/tenants/' + encodeURIComponent(id));
  const live = tenant.status === 1;

  return (
    <OnyxPlatformShell
      email={session.email}
      title={tenant.name}
      subtitle={plural(tenant.member_count, 'member') + ' · ' + plural(tenant.counts.courses, 'course')}
      sidebarNav={<TenantSidebarNav tenantId={tenant.id} tenantName={tenant.name} />}
    >
      <div className="min-w-0 space-y-5">
        <Link href="/onyx/platform"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted
                     hover:text-brand-700 hover:underline">
          &larr; Every institution
        </Link>

        <Card className={'p-4 ' + (live ? '' : 'border-red-300 bg-red-50/60')}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Icon name="building" className="h-5 w-5 text-brand-600" />
                <h2 className="min-w-0 break-words text-[17px] font-bold leading-tight">
                  {tenant.name}
                </h2>
                <StatusDot on={live} />
              </div>
              <p className="mt-1.5 break-all font-mono text-[12.5px] text-muted">
                {tenant.slug} &middot; #{tenant.id}
                {tenant.plan ? <> &middot; plan: {tenant.plan}</> : null}
              </p>
              <p className="mt-1.5 max-w-prose text-[13px] text-muted">
                {live
                  ? 'Everyone at this institution can sign in.'
                  : 'Nobody at this institution can sign in. Their data is untouched.'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <SuspendToggle tenantId={tenant.id} suspended={!live} />
            </div>
          </div>
          <TenantEditForm
            tenant={{ id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan }}
          />
          <div className="mt-3 border-t border-line pt-3">
            <DeleteTenantButton tenantId={tenant.id} tenantName={tenant.name} />
          </div>
        </Card>

        <div className="min-w-0">{children}</div>
      </div>
    </OnyxPlatformShell>
  );
}
