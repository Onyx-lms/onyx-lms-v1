import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxWorkspace } from '@/components/onyx-workspace';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { WorkspaceDetail } from '@/lib/onyx-codelab';

export const metadata: Metadata = { title: 'Workspace' };

/** LAB-05 -- one project: its tree, its snapshots and its review. */
export default async function OnyxWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const claims = await requireOnyxSession();
  const { id } = await params;
  const [me, workspace] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<WorkspaceDetail>('/api/onyx/workspaces/' + id),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={workspace.title}
      subtitle={workspace.language + ', entry ' + workspace.entry_path}
    >
      <Link href="/onyx/workspaces" className="text-sm text-slate-600 hover:underline">
        &larr; All workspaces
      </Link>
      <div className="mt-4">
        <OnyxWorkspace
          workspace={workspace}
          isOwner={Number(workspace.user_id) === claims.user_id}
          canReview={workspace.can_review}
        />
      </div>
    </OnyxShell>
  );
}
