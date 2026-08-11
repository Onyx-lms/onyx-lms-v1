import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Exam, SeatingPlan, Hall, ExamMark } from '@/lib/onyx-campus';
import { AllocateSeating, EnterMarks } from '@/components/onyx-manage';
import { CreatePanel, ActionButton } from '@/components/onyx-create';

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

  const [seat, plan, halls, marks, roster, members] = await Promise.all([
    staff ? null : onyxApiSafe<Seat>('/api/onyx/exams/' + id + '/seat'),
    staff ? onyxApiSafe<SeatingPlan>('/api/onyx/exams/' + id + '/seating') : null,
    staff ? onyxApiSafe<Hall[]>('/api/onyx/halls') : null,
    staff ? onyxApiSafe<ExamMark[]>('/api/onyx/exams/' + id + '/marks') : null,
    // Who sits this paper: whoever is enrolled on the course it belongs to.
    // The roster is enrolments only, so names come from the member list.
    staff ? onyxApiSafe<{ user_id: number }[]>(
      '/api/onyx/courses/' + exam.course_id + '/roster') : null,
    staff ? onyxApiSafe<{ user_id: number; user: { name: string } | null }[]>(
      '/api/onyx/members') : null,
  ]);

  const nameOf = new Map((members ?? []).map((m) => [Number(m.user_id), m.user?.name ?? null]));
  // Marks already entered, so re-opening the panel shows what is there rather
  // than a blank grid that reads as "nobody has been marked".
  const entered = new Map((marks ?? []).map((m) => [Number(m.user_id), Number(m.raw_marks)]));
  const candidates = (roster ?? []).map((r) => ({
    user_id: Number(r.user_id),
    name: nameOf.get(Number(r.user_id)) ?? 'User ' + r.user_id,
    current: entered.get(Number(r.user_id)) ?? null,
  }));
  const published = (marks ?? []).some((m) => m.status === 'published');

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={exam.title}
      subtitle={new Date(exam.starts_at).toLocaleString() + ' · ' + exam.duration_minutes + ' minutes'}
    >
      <div className="space-y-6">
        {/* CMP-02 end to end: seat the hall, enter the marks, moderate them,
            publish the results. Every step already existed on the API and had
            no way to reach it from a browser. */}
        {staff ? (
          <div className="flex flex-wrap items-start gap-2">
            <AllocateSeating examId={Number(id)} halls={halls ?? []} />
            <EnterMarks examId={Number(id)} maxMarks={exam.max_marks}
              candidates={candidates} />
            <CreatePanel
              title="Moderate this paper" cta="Moderate" icon="chart" compact
              endpoint={'exams/' + id + '/moderate'}
              fields={[
                { name: 'delta', label: 'Add to every mark', type: 'number',
                  min: -100, max: 100, required: true,
                  help: 'The raw mark is kept; this is recorded beside it.' },
                { name: 'reason', label: 'Reason', required: true, wide: true,
                  placeholder: 'Paper harder than intended' },
              ]}
            />
            {published ? (
              <span className="rounded-full bg-green-50 px-3 py-2 text-[13px] font-bold
                               text-green-800">Results published</span>
            ) : (
              <ActionButton endpoint={'exams/' + id + '/publish'} label="Publish results"
                confirm="Publish results to every candidate?" />
            )}
          </div>
        ) : null}

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
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                Seating &mdash; {plan.total} seated
              </h2>
              {/* CMP-02b: the plan goes on a door and the sheet goes on a
                  clipboard, so it has to leave the screen as a document. */}
              <a
                href={'/api/proxy/onyx/exams/' + id + '/seating.pdf'}
                download
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Print seating &amp; attendance sheet
              </a>
            </div>
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
