import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isExamsStaff, type Assessment, type MyAttempt } from '@/lib/onyx-assess';

export const metadata: Metadata = { title: 'Assessments' };

/** ASS-01 / ASS-04 -- what is coming up, and what came back. */
export default async function OnyxAssessmentsPage() {
  await requireOnyxSession();
  const [me, assessments] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Assessment[]>('/api/onyx/assessments'),
  ]);
  const staff = isExamsStaff(me.role);
  const mine = staff ? null : await onyxApiSafe<MyAttempt[]>('/api/onyx/my/assessments');
  const now = Date.now();

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Assessments"
      subtitle={staff ? 'Papers set at this institution.' : 'Your tests, and your results.'}
    >
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Assessment</th>
              <th className="px-4 py-3">Opens</th>
              <th className="px-4 py-3">Length</th>
              <th className="px-4 py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => {
              const open = (!a.opens_at || Date.parse(a.opens_at) <= now)
                && (!a.closes_at || Date.parse(a.closes_at) >= now);
              return (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link href={'/onyx/assessments/' + a.id} className="hover:underline">
                      {a.title}
                    </Link>
                    {a.proctoring ? (
                      <span className="ml-2 text-xs text-amber-700">monitored</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {a.opens_at ? new Date(a.opens_at).toLocaleString() : 'Any time'}
                  </td>
                  <td className="px-4 py-3 text-muted">{a.duration_minutes} min</td>
                  <td className="px-4 py-3 text-muted">
                    {a.status === 'draft' ? 'Draft'
                      : a.results_published_at ? 'Results out'
                        : open ? 'Open' : 'Closed'}
                  </td>
                </tr>
              );
            })}
            {assessments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Nothing scheduled.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {mine?.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Your results
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {mine.map((a) => (
              <li key={a.attempt_id} className="flex items-center gap-3 rounded-lg border
                                                border-line px-3 py-2">
                <span className="flex-1">{a.title}</span>
                {a.results_published ? (
                  <>
                    <span className="tabular-nums">{a.score} / {a.max_score}</span>
                    {a.passed !== null ? (
                      <span className={a.passed ? 'text-emerald-700' : 'text-rose-700'}>
                        {a.passed ? 'passed' : 'not passed'}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-muted">
                    {a.status === 'in_progress' ? 'in progress' : 'awaiting results'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </OnyxShell>
  );
}
