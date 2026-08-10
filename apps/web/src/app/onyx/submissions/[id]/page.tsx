import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxGrader } from '@/components/onyx-assignment';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Assignment, Submission } from '@/lib/onyx-learn';

export const metadata: Metadata = { title: 'Marking' };

/** LRN-04b -- marking one submission against the rubric. */
export default async function OnyxSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxPageRole('admin', 'faculty');
  const { id } = await params;

  const [me, submission] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Submission>('/api/onyx/submissions/' + id),
  ]);
  const assignment = await onyxApi<Assignment>('/api/onyx/assignments/' + submission.assignment_id);
  const members = await onyxApiSafe<{ user_id: number; user: { name: string } | null }[]>(
    '/api/onyx/members');
  const name = (members ?? []).find((m) => Number(m.user_id) === submission.user_id)?.user?.name;

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={assignment.title}
      subtitle={(name ?? 'User ' + submission.user_id)
        + ', attempt ' + submission.attempt
        + (submission.is_late ? ', submitted late' : '')}
    >
      <Link href={'/onyx/assignments/' + submission.assignment_id}
        className="text-sm text-slate-600 hover:underline">
        &larr; Back to the assignment
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <article className="whitespace-pre-wrap rounded-xl border border-slate-200 p-4
                            font-mono text-sm text-slate-700">
          {submission.body || 'Nothing was written.'}
        </article>
        <OnyxGrader
          submission={submission}
          rubric={assignment.rubric ?? []}
          totalPoints={assignment.total_points}
        />
      </div>
    </OnyxShell>
  );
}
