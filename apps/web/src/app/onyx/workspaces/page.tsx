import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
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

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {workspaces.map((w) => (
          <li key={w.id} className="rounded-2xl border border-line p-4">
            <Link href={'/onyx/workspaces/' + w.id} className="font-medium hover:underline">
              {w.title}
            </Link>
            <div className="text-xs text-muted">
              {w.language} · updated {new Date(w.updated_at).toLocaleDateString()}
            </div>
          </li>
        ))}
        {workspaces.length === 0 ? (
          <li className="text-sm text-muted">Nothing yet. Start a project above.</li>
        ) : null}
      </ul>
    </OnyxShell>
  );
}
