import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { APPLICATION_LABELS, type Application, type JobPost } from '@/lib/onyx-career';

export const metadata: Metadata = { title: 'Jobs' };

/**
 * CAR-04b -- the job board.
 *
 * The list itself is scoped by the API: an employer gets their own posts, a
 * learner gets the open ones, placement gets everything. This page renders
 * whichever it was given.
 */
export default async function OnyxJobsPage() {
  const claims = await requireOnyxSession();
  const [me, jobs] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<JobPost[]>('/api/onyx/jobs'),
  ]);
  const mine = claims.tenant_role === 'student'
    ? await onyxApiSafe<Application[]>('/api/onyx/my/applications')
    : null;
  const applied = new Set((mine ?? []).map((a) => a.job_id));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Jobs"
      subtitle={me.role === 'employer'
        ? 'Your posts at ' + me.tenant.name + '.'
        : 'Openings shared with this institution.'}
    >
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Where</th>
              <th className="px-4 py-3">Openings</th>
              <th className="px-4 py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={'/onyx/jobs/' + j.id} className="hover:underline">{j.title}</Link>
                  {applied.has(j.id)
                    ? <span className="ml-2 text-xs text-emerald-700">applied</span>
                    : null}
                </td>
                <td className="px-4 py-3 text-muted">{j.location ?? '—'}</td>
                <td className="px-4 py-3 tabular-nums">{j.openings}</td>
                <td className="px-4 py-3 capitalize text-muted">{j.status}</td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Nothing open at the moment.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {mine?.length ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Your applications
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {mine.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border
                                        border-line px-3 py-2">
                <span className="flex-1">{a.job?.title ?? 'A role'}</span>
                <span className="text-muted">
                  {APPLICATION_LABELS[a.status] ?? a.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </OnyxShell>
  );
}
