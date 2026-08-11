import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxPeople, type Member } from '@/components/onyx-people';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import { CreatePanel } from '@/components/onyx-create';

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

      {/* CMP-04: a guardian is a member of the institution in their own right,
          linked to a student. The link starts unaccepted -- the guardian
          confirms it themselves, so an administrator cannot quietly hand
          somebody's attendance and results to a third party. */}
      {claims.tenant_role === 'admin' ? (
        <div className="mt-6">
          <CreatePanel
            title="Link a guardian to a student" cta="Link a guardian" icon="users" compact
            endpoint="guardians"
            fields={[
              { name: 'guardian_user_id', label: 'Guardian', type: 'select', required: true,
                numeric: true, wide: true,
                options: members.filter((m) => m.role === 'guardian' && m.user)
                  .map((m) => ({ value: String(m.user!.id), label: m.user!.name })) },
              { name: 'student_user_id', label: 'Student', type: 'select', required: true,
                numeric: true, wide: true,
                options: members.filter((m) => m.role === 'student' && m.user)
                  .map((m) => ({ value: String(m.user!.id), label: m.user!.name })) },
              { name: 'relationship', label: 'Relationship', placeholder: 'Parent' },
            ]}
          />
        </div>
      ) : null}
    </OnyxShell>
  );
}
