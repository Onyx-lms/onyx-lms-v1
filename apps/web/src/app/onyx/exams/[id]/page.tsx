import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Exam, SeatingPlan, Hall, ExamMark } from '@/lib/onyx-campus';
import { AllocateSeating, EnterMarks, ExamEditForm, MarkOverride } from '@/components/onyx-manage';
import { CreatePanel, ActionButton } from '@/components/onyx-create';
import {
  Card, DataTable, Empty, EmptyRow, Icon, Meter, Pill, Score, SectionHead, State,
  Stepper, StatTile,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Exam' };

const EXAM_STAFF = ['admin', 'exams'];
const MIN = 60_000;

/** The pulsing live dot stops moving for anyone who has asked it to. */
const CALM = '[&_i]:motion-reduce:animate-none';

interface Seat { hall_id: number; seat_label: string; user_id: number; created_at: string }

/** Calendar days apart, so "tomorrow" does not depend on the hour of asking. */
function days(from: number, to: number): number {
  const startOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  return Math.round((startOf(to) - startOf(from)) / 86_400_000);
}

/**
 * When the paper is, relative first.
 *
 * "8/17/2026, 12:00:00 AM" makes urgency something a reader works out. The
 * clock time is still there, underneath, because that is what goes on a door.
 */
function whenText(start: number, end: number, now: number): { lead: string; sub: string } {
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined,
    { hour: '2-digit', minute: '2-digit' });
  const range = clock(start) + ' – ' + clock(end);
  if (!Number.isFinite(start)) return { lead: 'No date', sub: '' };
  if (now >= start && now < end) {
    const mins = Math.max(0, Math.round((end - now) / MIN));
    return {
      lead: mins < 60 ? mins + ' min left'
        : Math.floor(mins / 60) + ' h ' + String(mins % 60).padStart(2, '0') + ' min left',
      sub: range,
    };
  }
  const d = days(now, start);
  const word = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday'
    : d > 0 ? (d <= 13 ? 'In ' + d + ' days' : 'In ' + Math.round(d / 7) + ' weeks')
      : (d >= -13 ? Math.abs(d) + ' days ago' : Math.round(Math.abs(d) / 7) + ' weeks ago');
  return { lead: word, sub: range };
}

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
  // `staff` runs the examinations office: scheduling, seating, moderation,
  // publication -- EXAM_STAFF on both the API and here. `canMark` is wider:
  // examinations.service.ts's enterMarks() and marksForExam() have always
  // let a course's own faculty in too (grep EXAM_STAFF there, then
  // `role !== 'faculty'`), so a faculty member could already enter marks
  // through the API. This page just never gave them a way to reach it.
  const staff = EXAM_STAFF.includes(me.role);
  const canMark = staff || me.role === 'faculty';

  const [seat, plan, halls, marks, roster, members] = await Promise.all([
    canMark ? null : onyxApiSafe<Seat>('/api/onyx/exams/' + id + '/seat'),
    // The seating plan itself stays staff-only on the API (every candidate's
    // name against a room and a seat) -- faculty get the marks register
    // below instead, not this.
    staff ? onyxApiSafe<SeatingPlan>('/api/onyx/exams/' + id + '/seating') : null,
    staff ? onyxApiSafe<Hall[]>('/api/onyx/halls') : null,
    canMark ? onyxApiSafe<ExamMark[]>('/api/onyx/exams/' + id + '/marks') : null,
    // Who sits this paper: whoever is enrolled on the course it belongs to.
    // The roster is enrolments only, so names come from the member list.
    canMark ? onyxApiSafe<{ user_id: number }[]>(
      '/api/onyx/courses/' + exam.course_id + '/roster') : null,
    canMark ? onyxApiSafe<{ user_id: number; user: { name: string } | null }[]>(
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

  // The whole mark, not just the raw figure, for the register's Mark column.
  const markOf = new Map((marks ?? []).map((m) => [Number(m.user_id), m]));

  const now = Date.now();
  const start = Date.parse(exam.starts_at);
  const end = start + exam.duration_minutes * MIN;
  const when = whenText(start, end, now);
  const running = exam.status !== 'cancelled'
    && Number.isFinite(start) && now >= start && now < end;

  /* The lifecycle as a stepper rather than a status word: a single pill says
     where the paper is, this says what is behind it and what is left. Marks
     cannot be published from a paper still shown as running. */
  const stage = published ? 4
    : (marks ?? []).length > 0 ? 3
      : (now >= end || exam.status === 'completed') ? 2
        : running ? 1 : 0;
  const steps = ['Scheduled', 'Running', 'Closed', 'Marked', 'Published'].map((label, i) => ({
    label,
    state: (i < stage ? 'done' : i === stage ? 'current' : 'todo') as 'done' | 'current' | 'todo',
  }));

  const marked = candidates.filter((c) => c.current !== null).length;

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={exam.title}
      subtitle={when.lead + ' · ' + exam.duration_minutes + ' minutes · out of ' + exam.max_marks}
    >
      <nav aria-label="Breadcrumb"
        className="mb-4 flex items-center gap-1.5 text-[13px] text-muted">
        <Link href="/onyx/exams" className="font-semibold text-brand-600 hover:underline">
          Examinations
        </Link>
        <Icon name="chevron" className="h-3 w-3 text-faint" />
        <span className="truncate">{exam.title}</span>
      </nav>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <span className={CALM}><State tone="live">Running now</State></span>
          ) : null}
          {exam.status === 'cancelled'
            ? <Pill tone="late">Cancelled</Pill>
            : exam.status === 'draft' ? <Pill tone="neutral">Draft</Pill> : null}
          {canMark && exam.status !== 'cancelled' ? <Stepper steps={steps} /> : null}
        </div>

        {/* CMP-02 end to end: seat the hall, enter the marks, moderate them,
            publish the results. Every step already existed on the API and had
            no way to reach it from a browser. Seating/moderation/publication
            stay staff-only (examinations office); marking is wider -- a
            faculty member marking their own course's paper is the ordinary
            case, not the exception. */}
        {canMark ? (
          <div className="flex flex-wrap items-start gap-2">
            {staff ? <ExamEditForm examId={Number(id)} exam={exam} /> : null}
            {staff ? <AllocateSeating examId={Number(id)} halls={halls ?? []} /> : null}
            <EnterMarks examId={Number(id)} maxMarks={exam.max_marks}
              candidates={candidates} />
            {staff ? (
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
            ) : null}
            {staff ? (
              published ? (
                <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-2xl
                                 bg-green-50 px-3.5 text-[13px] font-bold text-green-700">
                  <Icon name="check" className="h-4 w-4" />
                  Results published
                </span>
              ) : (
                <ActionButton endpoint={'exams/' + id + '/publish'} label="Publish results"
                  confirm="Publish results to every candidate?" />
              )
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={running ? 'Time left' : 'When'} value={when.lead} note={when.sub} />
          <StatTile label="Duration" value={exam.duration_minutes + ' min'} />
          <StatTile label="Out of" value={exam.max_marks}
            note={'pass mark ' + exam.pass_marks} />
          {staff ? (
            <StatTile label="Seats used" value={plan?.total ?? 0}
              note={candidates.length + ' on the roster'} />
          ) : canMark ? (
            <StatTile label="Marked" value={marked}
              note={candidates.length + ' on the roster'} />
          ) : (
            <StatTile label="Pass mark" value={exam.pass_marks} />
          )}
        </div>

        {/* min-w-0 on the column that holds the register: without it the widest
            row sets the grid track and the whole page scrolls sideways on a
            phone, instead of the table scrolling inside its own box. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-start">
          <div className="min-w-0 space-y-6">
            {!canMark ? (
              seat ? (
                <Card className="p-4">
                  <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-muted">
                    Your seat
                  </div>
                  <div className="mt-1 text-[22px] font-extrabold tabular-nums">
                    {seat.seat_label}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">Hall #{seat.hall_id}</div>
                </Card>
              ) : (
                <Card className="p-0">
                  <Empty icon="calendar">Seating has not been published yet.</Empty>
                </Card>
              )
            ) : !staff ? (
              /* Faculty: the register they actually need -- who is on the
                 course and what they got, not the hall-by-hall seating plan,
                 which stays an examinations-office document (see the
                 /seating guard's comment above). */
              <section>
                <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                    Candidates &mdash; {candidates.length} on the roster
                  </h2>
                </div>
                <div tabIndex={0} role="region" aria-label="Candidates and marks">
                  <DataTable
                    caption="Candidates enrolled on this course, and their mark for this paper."
                    head={
                      <>
                        <th scope="col">Candidate</th>
                        <th scope="col">Grade</th>
                        <th scope="col">Mark</th>
                      </>
                    }
                  >
                    {candidates.length === 0 ? (
                      <EmptyRow colSpan={3} icon="users">
                        Nobody is enrolled on this course yet.
                      </EmptyRow>
                    ) : candidates.map((c) => {
                      const m = markOf.get(c.user_id);
                      return (
                        <tr key={c.user_id}>
                          <td className="font-semibold">{c.name}</td>
                          <td className="text-[13px] text-muted">
                            {m?.grade ?? <span aria-hidden>&mdash;</span>}
                            {m ? null : <span className="sr-only">Not marked</span>}
                          </td>
                          <td>
                            {m ? (
                              <Score value={m.final_marks} outOf={exam.max_marks}
                                band={m.final_marks >= exam.pass_marks ? 'hi' : 'lo'} />
                            ) : (
                              <Score value="—" band="none" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>
                </div>
              </section>
            ) : plan && plan.total > 0 ? (
              <section>
                <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                    Candidate register &mdash; {plan.total} seated
                  </h2>
                  {/* CMP-02b: the plan goes on a door and the sheet goes on a
                      clipboard, so it has to leave the screen as a document. */}
                  <a
                    href={'/api/proxy/onyx/exams/' + id + '/seating.pdf'}
                    download
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-2xl border
                               border-line px-3.5 text-[13px] font-bold text-slate-700
                               hover:bg-brand-50"
                  >
                    <Icon name="download" className="h-4 w-4" />
                    Seating &amp; attendance sheet
                  </a>
                </div>

                <div className="space-y-5">
                  {/* Ordered by seat, not by name: that is the order an
                      invigilator walks the hall in. */}
                  {plan.halls.map((h) => (
                    <div key={h.hall_id}>
                      <h3 className="mb-2 text-sm font-bold">{h.hall}</h3>
                      <div tabIndex={0} role="region" aria-label={'Seating for ' + h.hall}>
                        <DataTable
                          caption={'Seating for ' + h.hall}
                          head={
                            <>
                              <th scope="col">Seat</th>
                              <th scope="col">Candidate</th>
                              <th scope="col">Grade</th>
                              <th scope="col">Mark</th>
                            </>
                          }
                        >
                          {h.seats.map((s) => {
                            const m = markOf.get(Number(s.user_id));
                            return (
                              <tr key={s.seat_label}>
                                <td className="whitespace-nowrap font-semibold tabular-nums">
                                  {s.seat_label}
                                </td>
                                <td>{s.name ?? 'User #' + s.user_id}</td>
                                <td className="text-[13px] text-muted">
                                  {m?.grade ?? <span aria-hidden>&mdash;</span>}
                                  {m ? null : <span className="sr-only">Not marked</span>}
                                </td>
                                <td>
                                  {m ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Score value={m.final_marks} outOf={exam.max_marks}
                                        band={m.final_marks >= exam.pass_marks ? 'hi' : 'lo'} />
                                      <MarkOverride markId={m.id} maxMarks={exam.max_marks}
                                        current={m.final_marks} />
                                    </span>
                                  ) : (
                                    <Score value="—" band="none" />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {h.seats.length === 0 ? (
                            <EmptyRow colSpan={4} icon="users">
                              No seats have been allocated in this hall.
                            </EmptyRow>
                          ) : null}
                        </DataTable>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <Card className="p-0">
                <Empty icon="building">
                  No seating has been allocated yet. Allocating one fills every hall in seat
                  order and gives the invigilators a sheet to walk the room with.
                </Empty>
              </Card>
            )}
          </div>

          <aside className="min-w-0 space-y-6">
            {canMark ? (
              <section>
                <SectionHead title="Marking" />
                <Card className="p-4">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-bold">Scripts marked</span>
                    <span className="tabular-nums text-muted">
                      {marked} of {candidates.length}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Meter
                      percent={candidates.length ? (marked / candidates.length) * 100 : 0}
                      label={'Scripts marked on ' + exam.title} />
                  </div>
                  <dl className="mt-4 divide-y divide-line border-t border-line text-[13.5px]">
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-muted">Marks entered</dt>
                      <dd className="font-bold tabular-nums">{(marks ?? []).length}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-muted">Moderated</dt>
                      <dd className="font-bold tabular-nums">
                        {(marks ?? []).filter((m) => m.moderation_delta !== 0).length}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-muted">Results</dt>
                      <dd>
                        {published
                          ? <State tone="on">Published</State>
                          : <State tone="idle">Not published</State>}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </section>
            ) : null}

            <section>
              <SectionHead title="Paper" />
              <Card className="p-4">
                <dl className="divide-y divide-line text-[13.5px]">
                  <div className="flex items-center justify-between gap-3 pb-2.5">
                    <dt className="text-muted">Out of</dt>
                    <dd className="font-bold tabular-nums">{exam.max_marks}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-muted">Pass mark</dt>
                    <dd className="font-bold tabular-nums">{exam.pass_marks}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-muted">Starts</dt>
                    <dd className="text-right font-semibold">
                      {Number.isFinite(start)
                        ? new Date(start).toLocaleString(undefined,
                          { weekday: 'short', day: 'numeric', month: 'short',
                            hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-2.5">
                    <dt className="text-muted">Course</dt>
                    <dd>
                      <Link href={'/onyx/courses/' + exam.course_id}
                        className="font-semibold text-brand-600 hover:underline">
                        Course #{exam.course_id}
                      </Link>
                    </dd>
                  </div>
                </dl>
              </Card>
            </section>
          </aside>
        </div>
      </div>
    </OnyxShell>
  );
}
