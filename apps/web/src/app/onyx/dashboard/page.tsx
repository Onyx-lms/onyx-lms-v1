import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { ROLE_LABELS } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { formatDuration, isStaff, type Assignment, type Course, type Outline } from '@/lib/onyx-learn';
import { OnyxNudges } from '@/components/onyx-engage';
import {
  Banner, Buckets, Card, Hero, Icon, ListRow, Meter, Pill, Ring, RowList,
  SectionHead, StackBar, StatTile, Empty, relativeDue,
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
 * An operator's home screen is the opposite shape, and the admin design says
 * so: the institution in a few numbers, then the one breakdown behind them.
 * Everything the design shows beyond that -- integrity queues, fee arrears,
 * live sittings -- has no endpoint on this page, and inventing one is worse
 * than leaving it out.
 *
 * `employer` and `guardian` never render this page: they are outsiders whose
 * whole account is a view derived from links other people control, with no
 * course and no progress of their own.
 */
const REDIRECT: Partial<Record<string, string>> = {
  employer: '/onyx/jobs',
  guardian: '/onyx/family',
};

/** The role split, in the order an administrator reads it. */
const ROLE_ORDER = ['student', 'faculty', 'exams', 'placement', 'employer', 'admin'] as const;

/* Six marks that stay distinguishable in greyscale: the label is always
   beside the dot, so the colour is a locator and never the signal. */
const ROLE_MARKS: Record<(typeof ROLE_ORDER)[number], string> = {
  student:   'bg-brand-600',
  faculty:   'bg-brand-400',
  exams:     'bg-accent-500',
  placement: 'bg-brand-200',
  employer:  'bg-slate-400',
  admin:     'bg-ink',
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
  const headcount = (roster ?? []).length;
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
            <>
              {/* The institution in four numbers. A count on its own is a fact;
                  what makes it a signal is what it is a share of, which is why
                  each tile carries its denominator rather than floating alone. */}
              <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="Students" value={counts.student ?? 0}
                  note={headcount ? 'of ' + headcount + ' people' : undefined} />
                <StatTile label="Faculty" value={counts.faculty ?? 0}
                  note={headcount ? 'of ' + headcount + ' people' : undefined} />
                <StatTile label="Your courses" value={mine.length}
                  note={mine.length === 1 ? 'you teach 1' : 'you teach ' + mine.length} />
                <StatTile label="People" value={headcount} note="on the register" />
              </div>

              <section className="mb-5">
                <SectionHead title="People"
                  action={{ href: '/onyx/people', label: 'Manage people' }} />
                {/* One bar, then where it sits. Six disconnected tiles cannot
                    answer "how much of this institution is staff"; a total with
                    its breakdown under it can, and the bar and the rows share
                    an order so the eye can move between them. */}
                <Card className="p-4">
                  {headcount ? (
                    <>
                      <StackBar parts={ROLE_ORDER.map((r) => ({
                        value: counts[r] ?? 0, className: ROLE_MARKS[r],
                      }))} />
                      <Buckets rows={ROLE_ORDER.map((r) => ({
                        label: ROLE_LABELS[r],
                        dotClass: ROLE_MARKS[r],
                        amount: counts[r] ?? 0,
                      }))} />
                    </>
                  ) : (
                    <Empty icon="users">
                      Nobody has been added to {me.tenant.name} yet.
                    </Empty>
                  )}
                </Card>
              </section>
            </>
          ) : null}

          {due.length ? (
            <section className="mb-5">
              <SectionHead title="Due next" id="due-h"
                action={{ href: '/onyx/courses', label: 'All courses' }} />
              {/* A list, not a table: a learner is picking one thing to open
                  rather than comparing a column. Dates are relative because
                  what anyone scans this for is what is urgent. */}
              <RowList label="What is due next">
                {due.map((a) => {
                  const when = relativeDue(a.due_at);
                  return (
                    <ListRow
                      key={a.id}
                      icon="edit"
                      tone={when.tone === 'late' ? 'late' : when.tone === 'soon' ? 'brand' : 'neutral'}
                      title={a.title}
                      href={'/onyx/assignments/' + a.id}
                      meta={a.course.code + ' · ' + a.course.title}
                      trailing={<Pill tone={when.tone}>{when.text}</Pill>}
                    />
                  );
                })}
              </RowList>
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
                  const short = a.held - a.attended;
                  return (
                    <Banner key={a.course_id} tone="warn" icon="flag"
                      action={
                        <Link href="/onyx/timetable"
                          className="inline-flex min-h-[36px] items-center rounded-2xl border
                                     border-yellow-300 px-3 text-[13px] font-bold text-yellow-900
                                     hover:bg-yellow-100">
                          Timetable
                        </Link>
                      }
                    >
                      <strong>{course?.title ?? 'A course'}</strong> — {a.percent}%
                      {' '}({a.attended} of {a.held} sessions).
                      <span className="mt-0.5 block text-[13px]">
                        {short === 1
                          ? 'One session missed is what put this below the requirement.'
                          : `${short} sessions missed. This is below the requirement for this course.`}
                      </span>
                    </Banner>
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
              <RowList label="Quick links">
                {([
                  ['/onyx/timetable', 'Timetable', 'calendar'],
                  ['/onyx/results', 'Results', 'award'],
                  ['/onyx/fees', 'Fees', 'wallet'],
                  ['/onyx/support', 'Ask for help', 'help'],
                ] as const).map(([href, label, icon]) => (
                  <li key={href}>
                    <Link href={href}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-semibold
                                 hover:bg-brand-50/40 hover:text-brand-700">
                      <span className="text-brand-600"><Icon name={icon} /></span>
                      {label}
                      <span className="ml-auto text-muted">
                        <Icon name="chevron" className="h-4 w-4" />
                      </span>
                    </Link>
                  </li>
                ))}
              </RowList>
            </section>
          ) : null}

          {me.memberships.length > 1 ? (
            <Banner tone="info" icon="building">
              You belong to {me.memberships.length} institutions. Use the switcher to move
              between them &mdash; each shows only its own people and records.
            </Banner>
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
 *
 * The `<section aria-labelledby>` around the band is not decoration: it is how
 * this region is announced and how it is addressable, so it stays even though
 * the band itself is now the shared `Hero`.
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

  // The band names the lesson rather than saying "continue" and making
  // somebody click to find out what continuing means.
  const sub = nextLesson
    ? nextLesson.title
      + (nextLesson.duration_seconds ? ' — ' + formatDuration(nextLesson.duration_seconds) : '')
    : course.code + (course.credits ? ` · ${course.credits} credits` : '');

  return (
    <section className="mb-5" aria-labelledby="resume-h">
      <Hero
        eyebrow={percent > 0 ? 'Pick up where you left off' : 'Start here'}
        title={<span id="resume-h">{course.title}</span>}
        sub={sub}
        actions={
          <>
            <Link href={href}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-4
                         text-[14.5px] font-bold text-brand-700 hover:bg-brand-50
                         focus-visible:outline-white">
              <Icon name="play" className="h-4 w-4" />
              {percent > 0 ? 'Resume lesson' : 'Start course'}
            </Link>
            <Link href="/onyx/courses"
              className="inline-flex min-h-[44px] items-center rounded-2xl border border-white/30
                         bg-white/10 px-4 text-[14.5px] font-bold text-white hover:bg-white/20
                         focus-visible:outline-white">
              All courses
            </Link>
          </>
        }
      >
        <Meter percent={percent} label="Course progress" tone="light" />
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
          <span className="font-bold tabular-nums">{percent}% complete</span>
          <span className="tabular-nums text-white/80">
            {outline ? `${outline.progress.completed} of ${outline.progress.total} lessons` : ''}
          </span>
        </div>
      </Hero>
    </section>
  );
}

/**
 * The streak, drawn as the week.
 *
 * The days are pills rather than bare dots because colour is not allowed to be
 * the whole signal: a finished day carries a tick AND its letter, today is the
 * one solid pill, and the rest are plainly empty. Every learning product worth
 * copying draws the week this way, and it reads at a glance in a way
 * "longest 0 · nothing today" never did.
 */
function StreakCard({ progress }: { progress: ProgressSummary }) {
  const today = new Date().getDay();          // 0 = Sunday
  const monday = (today + 6) % 7;             // 0 = Monday, matching the labels
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const current = progress.streak.current;

  return (
    <section aria-labelledby="streak-h">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="text-[40px] font-extrabold leading-none tabular-nums text-accent-700">
            {current}
          </span>
          <span>
            <span id="streak-h" className="block text-[13.5px] font-bold">day streak</span>
            <span className="block text-[12.5px] text-muted">
              {progress.streak.longest > current
                ? `Best yet: ${progress.streak.longest} days`
                : progress.streak.active_today ? 'Counted for today' : 'Nothing today yet'}
            </span>
          </span>
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5">
          {labels.map((l, i) => {
            // Days before today in this week are "done" only as far back as the
            // streak actually reaches -- an 11-day best does not fill Monday if
            // the current run is 2.
            const done = i <= monday && (monday - i) < current;
            const isToday = i === monday;
            return (
              <li key={i}
                className={'inline-flex min-w-[34px] items-center justify-center gap-1 '
                  + 'rounded-full px-2 py-1 text-[12.5px] font-bold '
                  + (done
                    ? 'bg-green-50 text-green-700'
                    : isToday
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-muted')}>
                {done ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                <span aria-hidden="true">{l}</span>
                <span className="sr-only">
                  {names[i]}{isToday ? ', today' : ''}{done ? ', done' : ', nothing yet'}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-[12.5px] text-muted">
          Counted from lessons finished, work submitted and code run &mdash; not from
          signing in.
        </p>
      </Card>
    </section>
  );
}
