import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxReturnedWork, OnyxSubmissionForm } from '@/components/onyx-assignment';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isStaff, type Assignment } from '@/lib/onyx-learn';

export const metadata: Metadata = { title: 'Assignment' };

/**
 * LRN-04 -- one assignment.
 *
 * A learner sees the brief, the rubric they will be marked against, and their
 * own work. Faculty see the marking queue. The API decides which of those goes
 * in the payload, so this page renders whichever it was given rather than
 * asking for both and hiding one.
 */
export default async function OnyxAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const claims = await requireOnyxSession();
  const { id } = await params;
  const [me, assignment] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Assignment>('/api/onyx/assignments/' + id),
  ]);

  const staff = isStaff(claims.tenant_role);
  const members = staff
    ? await onyxApiSafe<{ user_id: number; user: { name: string; email: string } | null }[]>(
      '/api/onyx/members')
    : null;
  const names = new Map((members ?? []).map((m) => [Number(m.user_id), m.user]));
  const mine = assignment.my_submission ?? null;

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={assignment.title}
      subtitle={'Out of ' + assignment.total_points
        + (assignment.due_at ? ', due ' + new Date(assignment.due_at).toLocaleString() : '')}
    >
      <Link href={'/onyx/courses/' + assignment.course_id}
        className="text-sm text-slate-600 hover:underline">
        &larr; Back to the course
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {assignment.instructions ? (
            <article className="whitespace-pre-wrap text-sm text-slate-700">
              {assignment.instructions}
            </article>
          ) : null}

          {staff ? (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Submissions
              </h2>
              <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Learner</th>
                      <th className="px-4 py-3">Handed in</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(assignment.submissions ?? []).map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <Link href={'/onyx/submissions/' + s.id} className="hover:underline">
                            {names.get(s.user_id)?.name ?? ('User ' + s.user_id)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '-'}
                          {s.is_late
                            ? <span className="ml-2 text-xs text-amber-700">late</span>
                            : null}
                        </td>
                        <td className="px-4 py-3 capitalize">{s.status}</td>
                        <td className="px-4 py-3 tabular-nums">{s.score ?? '-'}</td>
                      </tr>
                    ))}
                    {(assignment.submissions ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          Nothing handed in yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <>
              {mine?.returned_at
                ? <OnyxReturnedWork assignment={assignment} submission={mine} />
                : null}
              <OnyxSubmissionForm assignment={assignment} submission={mine} />
            </>
          )}
        </div>

        <aside>
          {assignment.rubric?.length ? (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                How this is marked
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {assignment.rubric.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <span>
                      {c.title}
                      {c.description
                        ? <span className="block text-xs text-slate-500">{c.description}</span>
                        : null}
                    </span>
                    <span className="tabular-nums text-slate-600">{c.points}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                The criteria add up to the marks for the whole assignment.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </OnyxShell>
  );
}
