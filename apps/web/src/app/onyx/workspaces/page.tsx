import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { Empty, ListRow, Pill, RowList } from '@/components/onyx-ui';
import { OnyxNewWorkspace } from '@/components/onyx-workspace-new';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { Course } from '@/lib/onyx-learn';
import type { Workspace } from '@/lib/onyx-codelab';

export const metadata: Metadata = { title: 'Workspaces' };

/** LAB-05 -- a learner's project workspaces. */
export default async function OnyxWorkspacesPage() {
  await requireOnyxSession();
  const [me, workspaces, courses] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Workspace[]>('/api/onyx/workspaces'),
    onyxApi<Course[]>('/api/onyx/my/courses'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Workspaces"
      subtitle="Multi-file projects, with snapshots you can go back to."
    >
      <OnyxNewWorkspace courses={courses} />

      <div className="mt-6">
        <RowList label="Your workspaces">
          {workspaces.map((w) => (
            <ListRow
              key={w.id}
              icon="layers"
              tone="brand"
              title={w.title}
              href={'/onyx/workspaces/' + w.id}
              chips={<Pill tone="neutral">{w.language}</Pill>}
              meta={'Last worked on ' + new Date(w.updated_at).toLocaleDateString(undefined,
                { day: 'numeric', month: 'short', year: 'numeric' })}
              action={{ href: '/onyx/workspaces/' + w.id, label: 'Open' }}
            />
          ))}
          {workspaces.length === 0 ? (
            <li>
              <Empty icon="layers">
                No projects yet. Start one above and it keeps its own files and snapshots.
              </Empty>
            </li>
          ) : null}
        </RowList>
      </div>
    </OnyxShell>
  );
}
