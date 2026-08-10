import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Exam, SeatingPlan } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Exam' };

const EXAM_STAFF = ['admin', 'exams'];

interface Seat { hall_id: number; seat_label: string; user_id: number; created_at: string }

/**
 * CMP-02a/b -- one exam: when it is, and where you sit.
 *
 * The seating plan itself (every candidate, every hall) is staff-only -- it is
 * every candidate's name against a room and a seat, which is exactly the roster
 * a learner is never shown. A learner sees only their own row.
 */
export default async function OnyxExamPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxSession();
  const { id } = await params;
  const [me, exam] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Exam>('/api/onyx/exams/' + id),
  ]);
  const staff = EXAM_STAFF.includes(me.role);

  const [seat, plan] = await Promise.all([
    staff ? null : onyxApiSafe<Seat>('/api/onyx/exams/' + id + '/seat'),
    staff ? onyxApiSafe<SeatingPlan>('/api/onyx/exams/' + id + '/seating') : null,
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={exam.title}
      subtitle={new Date(exam.starts_at).toLocaleString() + ' · ' + exam.duration_minutes + ' minutes'}
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
            <dd className="mt-0.5">{exam.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Maximum</dt>
            <dd className="mt-0.5 tabular-nums">{exam.max_marks}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Pass mark</dt>
            <dd className="mt-0.5 tabular-nums">{exam.pass_marks}</dd>
          </div>
        </dl>

        {!staff ? (
          seat ? (
            <div className="rounded-2xl border border-line p-4">
              <div className="text-xs uppercase tracking-wide text-muted">Your seat</div>
              <div className="mt-1 text-lg font-semibold">
                Hall #{seat.hall_id} · {seat.seat_label}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">
              Seating has not been published yet.
            </p>
          )
        ) : plan && plan.total > 0 ? (
          <section>
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Seating &mdash; {plan.total} seated
            </h2>
            {plan.halls.map((h) => (
              <div key={h.hall_id} className="mt-4">
                <h3 className="text-sm font-medium">{h.hall}</h3>
                <table className="mt-2 w-full text-sm">
                  <caption className="sr-only">Seating for {h.hall}</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th scope="col" className="py-1 pr-3">Seat</th>
                      <th scope="col" className="py-1">Candidate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {h.seats.map((s) => (
                      <tr key={s.seat_label}>
                        <td className="py-1.5 pr-3 tabular-nums">{s.seat_label}</td>
                        <td className="py-1.5">{s.name ?? 'User #' + s.user_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ) : (
          <p className="text-sm text-muted">No seating has been allocated yet.</p>
        )}
      </div>
    </OnyxShell>
  );
}
