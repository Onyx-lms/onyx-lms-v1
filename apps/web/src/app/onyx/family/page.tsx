import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import { money, type FamilyChild } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Your family' };

/**
 * CMP-04 -- a guardian's whole world.
 *
 * Every switch a child has not turned on shows as "not shared" rather than
 * being left off the page, so a parent never mistakes silence for nothing to
 * report -- the page says which it is.
 */
export default async function OnyxFamilyPage() {
  await requireOnyxPageRole('guardian');
  const [me, family] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<{ children: FamilyChild[] }>('/api/onyx/family'),
  ]);

  return (
    <OnyxShell me={me} nav={navFor(me.role)} title="Your family"
      subtitle="Only what each learner has chosen to share.">
      <div className="space-y-8">
        {family.children.map((c) => (
          <section key={c.link_id} className="rounded-2xl border border-line p-4">
            <h2 className="text-lg font-semibold">{c.name ?? 'Learner #' + c.student_user_id}</h2>
            <p className="text-xs text-muted">{c.relationship}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Attendance</div>
                {c.shares.attendance && c.attendance ? (
                  <div className="mt-1 text-sm">
                    {c.attendance.percent}% ({c.attendance.attended} of {c.attendance.total})
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted">Not shared</div>
                )}
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Results</div>
                {c.shares.results && c.results ? (
                  <div className="mt-1 text-sm">
                    {c.results.results.length} published
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted">Not shared</div>
                )}
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted">Fees</div>
                {c.shares.fees && c.fees ? (
                  <div className="mt-1 text-sm">
                    {c.fees.outstanding_minor > 0
                      ? money(c.fees.outstanding_minor) + ' outstanding'
                      : 'Nothing outstanding'}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted">Not shared</div>
                )}
              </div>
            </div>

            {c.shares.results && c.results && c.results.results.length > 0 ? (
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">{(c.name ?? 'This learner') + '’s results'}</caption>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 pr-3">Exam</th>
                    <th scope="col" className="py-1 pr-3">Mark</th>
                    <th scope="col" className="py-1">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.results.results.map((r) => (
                    <tr key={r.exam_id}>
                      <td className="py-1.5 pr-3">{r.title}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.final_marks} / {r.max_marks}</td>
                      <td className="py-1.5">{r.grade ?? '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        ))}
        {family.children.length === 0 ? (
          <p className="text-sm text-muted">
            No learner has linked you as a guardian yet.
          </p>
        ) : null}
      </div>
    </OnyxShell>
  );
}
