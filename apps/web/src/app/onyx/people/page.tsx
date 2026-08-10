import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxPeople, type Member } from '@/components/onyx-people';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';

export const metadata: Metadata = { title: 'People' };

/** F-04 / F-06 -- the roster. Faculty may read it; administrators may change it. */
export default async function OnyxPeoplePage() {
  const claims = await requireOnyxPageRole('admin', 'faculty');
  const [me, members] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Member[]>('/api/onyx/members'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="People"
      subtitle={'Everyone at ' + me.tenant.name + '. Nobody from anywhere else.'}
    >
      <OnyxPeople members={members} canEdit={claims.tenant_role === 'admin'} />
    </OnyxShell>
  );
}
