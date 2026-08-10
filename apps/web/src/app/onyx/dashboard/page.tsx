import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { ROLE_LABELS } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isStaff, type Assignment, type Course, type Outline } from '@/lib/onyx-learn';
import { OnyxNudges } from '@/components/onyx-engage';
import {
  Card, SectionHead, StatTile, Pill, Ring, Meter, Icon, Empty, relativeDue,
} from '@/components/onyx-ui';
import type { ProgressSummary } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Dashboard' };

interface AttendanceLine {
  course_id: number; held: number; attended: number; percent: number; below_threshold: boolean;
}

/**
 * LRN-01b / LRN-05 -- what someone sees when they arrive.
 *
 * The proposal's claim for Onyx Learn is that "every learner always knows
 * what to do next", so the page is ordered by that: the single action that
 * resumes their work, then what is due, then everything else. The previous
 * version opened on four counters -- which is what a person looks at *after*
 * they know what to do, not instead of it.
 *
 * `employer` and `guardian` never render this page: they are outsiders whose
 * whole account is a view derived from links other people control, with no
 * course and no progress of their own.
 */
const REDIRECT: Partial<Record<string, string>> = {
  employer: '/onyx/jobs',
  guardian: '/onyx/family',
};

export default async function OnyxDashboard() {
  await requireOnyxSession();
  const me = await onyxApi<Me>('/api/onyx/me');
  if (REDIRECT[me.role]) redirect(REDIRECT[me.role]!);

  const staff = isStaff(me.role);
  const isLearner = me.role === 'student';

  const [courses, attendance, roster, progress] = await Promise.all([
    onyxApiSafe<Course[]>('/api/onyx/my/courses'),
    staff ? null : onyxApiSafe<AttendanceLine[]>('/api/onyx/my/attendance'),
    staff ? onyxApiSafe<{ role: string }[]>('/api/onyx/members') : null,
    isLearner ? onyxApiSafe<ProgressSummary>('/api/onyx/progress') : null,
  ]);
  const mine = courses ?? [];

  const assignmentLists = await Promise.all(mine.map((c) =>
    onyxApiSafe<Assignment[]>('/api/onyx/courses/' + c.id + '/assignments')
      .then((list) => (list ?? []).map((a) => ({ ...a, course: c })))));

  // Per-course progress, from each course's own outline.
  //
  // `/api/onyx/my/courses` returns bare course rows with no progress on them,
  // so an earlier version of this page painted the learner's PLATFORM-WIDE
  // percentage onto every course card -- two different courses both showing
  // "50%" because that was the overall figure. These are the real numbers,
  // and they are what the resume card picks its target from.
  const outlines = await Promise.all(mine.map((c) =>
    onyxApiSafe<Outline>('/api/onyx/courses/' + c.id + '/outline')));
  const progressFor = new Map<number, Outline['progress']>();
  mine.forEach((c, i) => {
    const o = outlines[i];
    if (o) progressFor.set(c.id, o.progress);
  });

  // Everything still outstanding, soonest first -- including what is already
  // late, which the old version dropped entirely by filtering to due_at > now.
  // A missed deadline is the most important row on this page, not the one to
  // hide.
  const due = assignmentLists.flat()
    .filter((a) => a.status === 'published' && a.due_at)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))
    .slice(0, 5);

  const counts = (roster ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});
  const shortfall = (attendance ?? []).filter((a) => a.below_threshold);

  const firstName = (me.email ?? '').split('@')[0]!.split(/[._]/)[0]!;
  const greeting = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <OnyxShell
      me={me}
      title={isLearner ? `Hi, ${greeting} 👋` : me.tenant.name}
      subtitle={isLearner
        ? progressLine(progress)
        : 'Signed in as ' + ROLE_LABELS[me.role].toLowerCase() + '.'}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.62fr)_minmax(290px,.92fr)] xl:items-start">
        {/* ---------------- main column ---------------- */}
        <div className="min-w-0">
          {isLearner ? <ResumeCard courses={mine} outlines={outlines} /> : null}

          {staff ? (
            <section className="mb-5">
              <SectionHead title="People" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(['student', 'faculty', 'exams', 'placement', 'employer', 'admin'] as const)
                  .map((role) => (
                    <StatTile key={role} label={ROLE_LABELS[role]} value={counts[role] ?? 0} />
                  ))}
              </div>
            </section>
          ) : null}

          {due.length ? (
            <section className="mb-5">
              <SectionHead title="Due next" id="due-h"
                action={{ href: '/onyx/courses', label: 'All courses' }} />
              <Card>
                <ul>
                  {due.map((a, i) => {
                    const when = relativeDue(a.due_at);
                    return (
                      <li key={a.id} className={i ? 'border-t border-line' : ''}>
                        <Link href={'/onyx/assignments/' + a.id}
                          className="flex items-center gap-3 px-4 py-3.5 hover:bg-brand-50/40">
                          <span aria-hidden="true"
                            className={'h-2.5 w-2.5 shrink-0 rounded-full '
                              + (when.tone === 'late' ? 'bg-red-600'
                                : when.tone === 'soon' ? 'bg-accent-500' : 'bg-faint')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-semibold">
                              {a.title}
                            </span>
                            <span className="block truncate text-[12.5px] text-muted">
                              {a.course.code} · {a.course.title}
                            </span>
                          </span>
                          <Pill tone={when.tone}>{when.text}</Pill>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ) : null}

          <section className="mb-5">
            <SectionHead title={staff ? 'Your courses' : 'What you are taking'}
              action={{ href: '/onyx/courses', label: 'Catalogue' }} />
            {mine.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {mine.map((c) => (
                  <Card key={c.id}>
                    <Link href={'/onyx/courses/' + c.id}
                      className="flex items-center gap-3.5 p-3.5">
                      <Ring percent={progressFor.get(c.id)?.percent ?? 0} />
                      <span className="min-w-0">
                        <span className="block truncate text-[14.5px] font-bold">{c.title}</span>
                        <span className="block truncate text-[12.5px] text-muted">
                          {c.code}{c.credits ? ` · ${c.credits} credits` : ''}
                        </span>
                      </span>
                    </Link>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <Empty icon="book">
                  Nothing yet.{' '}
                  <Link href="/onyx/courses" className="font-semibold text-brand-600 underline">
                    Look at the catalogue
                  </Link>.
                </Empty>
              </Card>
            )}
          </section>

          {shortfall.length ? (
            <section className="mb-5">
              <SectionHead title="Attendance needs attention" />
              <div className="space-y-2">
                {shortfall.map((a) => {
                  const course = mine.find((c) => c.id === a.course_id);
                  return (
                    <div key={a.course_id}
                      className="flex items-center gap-3 rounded-2xl border border-accent-100
                                 bg-accent-50 px-4 py-3 text-sm text-accent-700">
                      <Icon name="flag" className="h-5 w-5" />
                      <span>
                        <strong>{course?.title ?? 'A course'}</strong> — {a.percent}%
                        ({a.attended} of {a.held} sessions)
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        {/* ---------------- right rail ---------------- */}
        <div className="min-w-0 space-y-5">
          {progress ? <StreakCard progress={progress} /> : null}

          {progress ? (
            <section>
              <SectionHead title="This week" />
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Lessons" value={progress.lessons.completed}
                  note={`of ${progress.lessons.total}`} />
                <StatTile label="Attendance" value={progress.attendance.percent + '%'}
                  note={`${progress.attendance.attended} of ${progress.attendance.sessions}`} />
                <StatTile label="Solved" value={progress.practice.solved}
                  note={`of ${progress.practice.attempted} tried`} />
                <StatTile label="Submitted" value={progress.assignments.submitted}
                  note={`${progress.assignments.due} outstanding`} />
              </div>
            </section>
          ) : null}

          {progress?.nudges.length ? (
            <section>
              <SectionHead title="What to do next" />
              <OnyxNudges nudges={progress.nudges} />
            </section>
          ) : null}

          {isLearner ? (
            <section>
              <SectionHead title="Quick links" />
              <Card>
                <ul>
                  {([
                    ['/onyx/timetable', 'Timetable', 'calendar'],
                    ['/onyx/results', 'Results', 'award'],
                    ['/onyx/fees', 'Fees', 'wallet'],
                    ['/onyx/support', 'Ask for help', 'help'],
                  ] as const).map(([href, label, icon], i) => (
                    <li key={href} className={i ? 'border-t border-line' : ''}>
                      <Link href={href}
                        className="flex items-center gap-3 px-4 py-3 text-sm font-medium
                                   hover:bg-brand-50/40 hover:text-brand-700">
                        <span className="text-brand-600"><Icon name={icon} /></span>
                        {label}
                        <span className="ml-auto text-muted">
                          <Icon name="chevron" className="h-4 w-4" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}

          {me.memberships.length > 1 ? (
            <p className="text-sm text-muted">
              You belong to {me.memberships.length} institutions. Use the switcher to move
              between them &mdash; each shows only its own people and records.
            </p>
          ) : null}
        </div>
      </div>
    </OnyxShell>
  );
}

/* ------------------------------------------------------------------ parts */

function progressLine(p: ProgressSummary | null): string {
  if (!p) return 'Welcome back.';
  const left = p.lessons.total - p.lessons.completed;
  if (p.courses.enrolled === 0) return 'You are not enrolled in a course yet.';
  if (left <= 0 && p.lessons.total > 0) return "You've finished every lesson. Nice.";
  if (left === 1) return "You're 1 lesson from finishing your plan.";
  if (left > 1) return `You're ${left} lessons from finishing your plan.`;
  return 'Welcome back.';
}

/**
 * The single most important control on the page: get back to work.
 *
 * Every serious learning product opens on this -- Uxcel, Coursera, Codecademy
 * and Mindvalley all lead with a resume card. Onyx previously had no resume
 * affordance at all, so a student landed on counters and went hunting.
 */
function ResumeCard({ courses, outlines }: {
  courses: Course[]; outlines: (Outline | null)[];
}) {
  if (!courses.length) return null;

  // The course to resume is the one actually part-finished. Falling back to
  // whichever course happened to sort first would send a learner who is 90%
  // through one course into a different one they have not started.
  let index = outlines.findIndex((o) => o && o.progress.percent > 0 && o.progress.percent < 100);
  if (index === -1) index = outlines.findIndex((o) => o && o.progress.percent < 100);
  if (index === -1) index = 0;

  const course = courses[index]!;
  const outline = outlines[index] ?? null;
  const percent = outline?.progress.percent ?? 0;

  // Deep-link to the first lesson they have not finished, so "Resume" resumes
  // rather than dropping them at the top of the syllabus to find their place.
  const nextLesson = outline?.modules
    .flatMap((m) => m.lessons)
    .find((l) => !l.completed_at && !l.locked) ?? null;
  const href = nextLesson
    ? `/onyx/courses/${course.id}/lessons/${nextLesson.id}`
    : `/onyx/courses/${course.id}`;

  return (
    <section
      className="mb-5 overflow-hidden rounded-[20px] bg-gradient-to-br from-brand-600
                 to-brand-900 p-5 text-white shadow-lift sm:p-6"
      aria-labelledby="resume-h"
    >
      <span className="inline-flex items-center rounded-full border border-white/25
                       bg-white/15 px-2.5 py-1 text-[10.5px] font-bold uppercase
                       tracking-[.1em]">
        {percent > 0 ? 'Pick up where you left off' : 'Start here'}
      </span>
      <h2 id="resume-h" className="mt-3 text-xl font-extrabold sm:text-2xl">{course.title}</h2>
      <p className="mt-1 text-sm text-white/80">
        {nextLesson ? nextLesson.title : course.code}
        {nextLesson ? '' : course.credits ? ` · ${course.credits} credits` : ''}
      </p>

      <div className="mt-4">
        <Meter percent={percent} label="Course progress" tone="light" />
        <div className="mt-2 flex items-center justify-between text-[12.5px] text-white/85">
          <span>{percent}% complete</span>
          <span>
            {outline ? `${outline.progress.completed} of ${outline.progress.total} lessons` : ''}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Link href={href}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5
                     text-[14.5px] font-bold text-brand-700 hover:bg-brand-50
                     focus-visible:outline-white">
          <Icon name="play" className="h-4 w-4" />
          {percent > 0 ? 'Resume lesson' : 'Start course'}
        </Link>
        <Link href="/onyx/courses"
          className="inline-flex items-center rounded-xl border border-white/30 bg-white/10
                     px-4 py-2.5 text-[14.5px] font-bold text-white hover:bg-white/20
                     focus-visible:outline-white">
          All courses
        </Link>
      </div>
    </section>
  );
}

/**
 * The one deliberately coloured card.
 *
 * Duolingo colours exactly one stat and leaves the rest white; that is what
 * keeps a high-energy dashboard from turning into confetti. The day circles
 * are the pattern every learning product converged on -- Nibble, Brilliant,
 * Vocabulary and Coursera all draw the week the same way -- and they read at
 * a glance in a way "longest 0 · nothing today" never did.
 */
function StreakCard({ progress }: { progress: ProgressSummary }) {
  const today = new Date().getDay();          // 0 = Sunday
  const monday = (today + 6) % 7;             // 0 = Monday, matching the labels
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const current = progress.streak.current;

  return (
    <section aria-labelledby="streak-h"
      className="rounded-[20px] border border-accent-100 bg-gradient-to-br from-[#FFF3E0]
                 to-[#FCE3BE] p-4.5 p-[18px]">
      <div className="flex items-center gap-3">
        <span className="text-[40px] font-extrabold leading-none tabular-nums text-accent-700">
          {current}
        </span>
        <span>
          <span id="streak-h" className="block text-[13px] font-bold text-accent-700">
            day streak
          </span>
          <span className="block text-[12.5px] text-[#8A5A22]">
            {progress.streak.longest > current
              ? `Best yet: ${progress.streak.longest} days`
              : progress.streak.active_today ? 'Counted for today' : 'Nothing today yet'}
          </span>
        </span>
      </div>

      <div className="mt-4 flex justify-between gap-1.5">
        {labels.map((l, i) => {
          // Days before today in this week are "done" only as far back as the
          // streak actually reaches -- an 11-day best does not fill Monday if
          // the current run is 2.
          const done = i <= monday && (monday - i) < current;
          const isToday = i === monday;
          return (
            <div key={i} className="flex-1 text-center">
              <span className="mb-1.5 block text-[10.5px] font-bold uppercase text-[#8A5A22]">
                {l}
              </span>
              <span aria-hidden="true"
                className={'mx-auto grid h-[30px] w-[30px] place-items-center rounded-full '
                  + 'text-[13px] '
                  + (done
                    ? 'bg-accent-500 text-white'
                    : 'border-[1.5px] border-accent-600/20 bg-white/70 text-accent-500')
                  + (isToday ? ' ring-2 ring-accent-700 ring-offset-2 ring-offset-[#FCE3BE]' : '')}>
                {done ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="sr-only">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}
                {isToday ? ', today' : ''}{done ? ', done' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
