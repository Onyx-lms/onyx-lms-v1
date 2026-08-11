import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { ResourceLink } from '@/components/onyx-player';
import { OnyxAskForm } from '@/components/onyx-engage';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import {
  formatDuration, isStaff,
  type Assignment, type AttendanceSession, type Outline, type Resource,
} from '@/lib/onyx-learn';
import type { Discussion } from '@/lib/onyx-campus';
import { CreatePanel, ActionButton } from '@/components/onyx-create';
import {
  Card, Empty, Icon, Meter, Pill, SectionHead, relativeDue,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Course' };

/**
 * LRN-02a -- one course, end to end.
 *
 * The whole "so every learner always knows what to do next" claim rests on this
 * page: the outline, what is due, and when the next session is, together rather
 * than in three places.
 */
export default async function OnyxCoursePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxSession();
  const { id } = await params;

  const [me, outline, members] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Outline>('/api/onyx/courses/' + id + '/outline'),
    // Only an administrator may allocate teaching, and only they can read the
    // roster -- so this is fetched for them and nobody else.
    onyxApiSafe<{ user: { id: number; name: string } | null; role: string }[]>(
      '/api/onyx/members'),
  ]);
  const teachers = (members ?? []).filter((m) => m.role === 'faculty' || m.role === 'admin');

  // A learner who is not enrolled sees the catalog view: the shape of the
  // course, and nothing that belongs to the people taking it.
  const visible = outline.enrolled || isStaff(me.role);
  const [assignments, sessions, resources, discussions] = visible
    ? await Promise.all([
      onyxApiSafe<Assignment[]>('/api/onyx/courses/' + id + '/assignments'),
      onyxApiSafe<AttendanceSession[]>('/api/onyx/courses/' + id + '/attendance'),
      onyxApiSafe<Resource[]>('/api/onyx/courses/' + id + '/resources'),
      onyxApiSafe<Discussion[]>('/api/onyx/courses/' + id + '/discussions'),
    ])
    : [null, null, null, null];

  const due = (assignments ?? [])
    .filter((a) => a.status === 'published' && a.due_at)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));

  // The next thing to do: the first lesson that is neither finished nor locked,
  // in the order the course is taught. This is what the hero's button points
  // at, and it is the difference between "continue" and knowing what continuing
  // means before you click it.
  const lessons = outline.modules.flatMap((m) => m.lessons);
  const next = lessons.find((l) => !l.completed_at && !l.locked) ?? null;
  const finished = lessons.length > 0 && lessons.every((l) => l.completed_at);

  /** Which icon a lesson gets. A row of identical dots tells a learner nothing. */
  const lessonIcon = (type: string) =>
    type === 'video' ? 'play' : type === 'link' ? 'chevron' : 'book';

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={outline.course.title}
      subtitle={outline.course.code + (outline.course.credits ? ' · ' + outline.course.credits + ' credits' : '')}
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <div className="space-y-6">
          {outline.enrolled ? (
            /* The band a learner came here for. Progress alone tells you where
               you are and not what to do; the point of a course page is the
               next lesson, so that is the button -- and it names the lesson
               rather than saying "continue" and making you find out. */
            <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700
                                to-brand-900 p-5 text-white shadow-lift">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[.11em] text-white/70">
                    {finished ? 'Course complete' : next ? 'Up next' : 'Nothing to do yet'}
                  </p>
                  <p className="mt-1 text-[19px] font-extrabold leading-snug">
                    {finished
                      ? 'You have finished every lesson.'
                      : next?.title ?? 'No lessons have been published on this course.'}
                  </p>
                </div>
                {next ? (
                  <Link
                    href={'/onyx/courses/' + id + '/lessons/' + next.id}
                    className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-2xl
                               bg-white px-4 text-[14px] font-bold text-brand-800
                               hover:bg-brand-50"
                  >
                    <Icon name="play" className="h-3.5 w-3.5" />
                    {outline.progress.completed > 0 ? 'Resume' : 'Start'}
                  </Link>
                ) : null}
              </div>

              {outline.progress.total > 0 ? (
                <div className="mt-4">
                  <Meter percent={outline.progress.percent} tone="light"
                    label={outline.course.title + ' progress'} />
                  <div className="mt-2 flex items-baseline justify-between text-[13px]">
                    <span className="font-bold tabular-nums">
                      {outline.progress.percent}% complete
                    </span>
                    <span className="tabular-nums text-white/75">
                      {outline.progress.completed} of {outline.progress.total} lessons
                    </span>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-slate-700">
                You are not enrolled in this course. Preview lessons are open; the rest is not.
              </p>
              {outline.course.self_enroll && me.role === 'student' ? (
                <div className="mt-3">
                  <ActionButton endpoint={'courses/' + id + '/enroll'} label="Join this course" />
                </div>
              ) : null}
            </Card>
          )}

          {/* Modules numbered, because a course IS an order -- "02" tells a
              learner where they are in a way a bare title does not. Each lesson
              carries its own state: a check when it is done, the next one
              marked, a lock where it is not open yet. */}
          {outline.modules.map((m, mi) => (
            <section key={m.id}>
              <div className="mb-2.5 flex items-baseline gap-2.5">
                <span className="font-mono text-[13px] font-bold tabular-nums text-accent-700">
                  {String(mi + 1).padStart(2, '0')}
                </span>
                <h2 className="text-[15px] font-bold">{m.title}</h2>
                <span className="ml-auto text-[12.5px] tabular-nums text-muted">
                  {m.lessons.length} {m.lessons.length === 1 ? 'lesson' : 'lessons'}
                </span>
              </div>
              {m.summary ? (
                <p className="-mt-1 mb-2.5 text-[13px] text-muted">{m.summary}</p>
              ) : null}

              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line
                             bg-white shadow-card">
                {m.lessons.map((l) => {
                  const isNext = next?.id === l.id;
                  return (
                    <li key={l.id}
                      className={'flex items-center gap-3 px-4 py-3 '
                        + (isNext ? 'bg-brand-50/70' : 'hover:bg-brand-50/40')}>
                      <span className={'grid h-9 w-9 shrink-0 place-items-center rounded-xl '
                        + (l.completed_at ? 'bg-green-50 text-green-700'
                          : l.locked ? 'bg-slate-100 text-muted'
                            : 'bg-brand-50 text-brand-700')}>
                        <Icon name={l.completed_at ? 'check' : lessonIcon(l.type)}
                          className="h-[17px] w-[17px]" />
                      </span>

                      <span className="min-w-0 flex-1">
                        {l.locked ? (
                          <span className="text-[14.5px] text-muted">{l.title}</span>
                        ) : (
                          <Link href={'/onyx/courses/' + id + '/lessons/' + l.id}
                            className="text-[14.5px] font-semibold hover:underline">
                            {l.title}
                          </Link>
                        )}
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]
                                         text-muted">
                          {l.duration_seconds ? (
                            <span className="tabular-nums">{formatDuration(l.duration_seconds)}</span>
                          ) : null}
                          {l.is_preview ? <span>· free preview</span> : null}
                        </span>
                      </span>

                      {isNext ? <Pill tone="brand">Next</Pill> : null}
                      {l.completed_at ? <Pill tone="good">Done</Pill> : null}
                      {l.locked ? <Pill tone="neutral">Locked</Pill> : null}
                    </li>
                  );
                })}
                {m.lessons.length === 0 ? (
                  <li><Empty icon="layers">Nothing has been added to this module yet.</Empty></li>
                ) : null}
              </ul>
            </section>
          ))}

          {outline.modules.length === 0 ? (
            <Card className="p-2">
              <Empty icon="book">
                This course has no content yet.
                {isStaff(me.role) ? ' Add a module below to start building it.' : ''}
              </Empty>
            </Card>
          ) : null}

          {/* LRN-02: content delivery starts with somebody being able to put
              content in. Modules and lessons had no authoring surface. */}
          {isStaff(me.role) ? (
            <div className="mt-4 space-y-3">
              <CreatePanel
                title="New module" cta="Add a module" icon="layers" compact
                endpoint={'courses/' + id + '/modules'}
                fields={[
                  { name: 'title', label: 'Module title', required: true,
                    placeholder: 'Core concepts' },
                  { name: 'summary', label: 'Summary', type: 'textarea', rows: 2 },
                ]}
              />
              {outline.modules.map((m) => (
                <CreatePanel
                  key={'add-lesson-' + m.id}
                  title={'New lesson in "' + m.title + '"'}
                  cta={'Add a lesson to ' + m.title} icon="edit" compact
                  endpoint={'modules/' + m.id + '/lessons'}
                  fields={[
                    { name: 'title', label: 'Lesson title', required: true },
                    { name: 'type', label: 'Kind', type: 'select', fallback: 'text',
                      options: [
                        { value: 'text', label: 'Text' },
                        { value: 'video', label: 'Video' },
                        { value: 'pdf', label: 'PDF' },
                      ] },
                    { name: 'body', label: 'Lesson text', type: 'textarea', rows: 4,
                      help: 'A text lesson needs this. A video or PDF needs a source path instead.' },
                    { name: 'path', label: 'Source path (video or PDF)',
                      placeholder: 'uploads/lesson.mp4' },
                    { name: 'duration_seconds', label: 'Length (seconds)', type: 'number',
                      min: 0, fallback: 300 },
                    { name: 'is_preview', label: 'Free preview', type: 'checkbox' },
                  ]}
                />
              ))}
            </div>
          ) : null}

          {visible ? (
            <section>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 className="text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                  Questions
                </h2>
                <OnyxAskForm courseId={Number(id)} />
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line
                             bg-white shadow-card">
                {(discussions ?? []).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3
                                            hover:bg-brand-50/40">
                    <span className={'grid h-9 w-9 shrink-0 place-items-center rounded-xl '
                      + (d.status === 'resolved'
                        ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-muted')}>
                      <Icon name={d.status === 'resolved' ? 'check' : 'help'}
                        className="h-[17px] w-[17px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={'/onyx/discussions/' + d.id}
                        className="block truncate text-[14.5px] font-semibold hover:underline">
                        {d.title}
                      </Link>
                      <span className="text-[12.5px] text-muted">
                        {d.reply_count} {d.reply_count === 1 ? 'reply' : 'replies'}
                      </span>
                    </span>
                    {d.status === 'resolved' ? <Pill tone="good">Resolved</Pill> : null}
                  </li>
                ))}
                {(discussions ?? []).length === 0 ? (
                  <li>
                    <Empty icon="help">
                      Nobody has asked anything yet. If you are stuck, asking here reaches
                      the people teaching this course.
                    </Empty>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          {/* CMP-01 names "faculty allocation" as part of the console. There
              was no way to put a teacher on a course, so a faculty member
              opening one was told "You do not teach this course" with nothing
              they or an administrator could do about it from the product. */}
          {me.role === 'admin' && teachers.length ? (
            <section className="mb-4">
              <h2 className="mb-2 text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                Teaching
              </h2>
              <CreatePanel
                title="Assign a teacher" cta="Assign a teacher" icon="users" compact
                endpoint={'courses/' + id + '/faculty'}
                fields={[
                  { name: 'user_id', label: 'Faculty member', type: 'select',
                    required: true, numeric: true, wide: true,
                    options: teachers.map((m) => ({
                      value: String(m.user?.id ?? 0),
                      label: m.user?.name ?? 'User ' + (m.user?.id ?? '?'),
                    })) },
                ]}
              />
            </section>
          ) : null}

          {/* LRN-04: "faculty must create assignments". They could not. */}
          {isStaff(me.role) ? (
            <section>
              <h2 className="mb-2 text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                Set work
              </h2>
              <CreatePanel
                title="New assignment" cta="Create an assignment" icon="edit" compact
                endpoint={'courses/' + id + '/assignments'}
                fields={[
                  { name: 'title', label: 'Title', required: true, wide: true,
                    placeholder: 'Number bases worksheet' },
                  { name: 'instructions', label: 'Instructions', type: 'textarea', rows: 4 },
                  { name: 'due_at', label: 'Due', type: 'datetime' },
                  { name: 'total_points', label: 'Marks', type: 'number', min: 1, max: 1000,
                    fallback: 100 },
                  { name: 'late_policy', label: 'If it is late', type: 'select',
                    fallback: 'accept',
                    options: [
                      { value: 'accept', label: 'Accept it' },
                      { value: 'penalty', label: 'Accept with a penalty' },
                      { value: 'reject', label: 'Refuse it' },
                    ] },
                  { name: 'late_penalty_percent', label: 'Penalty %', type: 'number',
                    min: 0, max: 100, fallback: 0 },
                ]}
                // Published on creation: an assignment nobody can see is a
                // draft, and the common case is setting work that is set.
                thenPost="assignments/:id/publish"
              />
            </section>
          ) : null}

          {due.length ? (
            <section>
              <SectionHead title="Due" />
              <Card>
                <ul className="divide-y divide-line">
                  {due.map((a) => {
                    const when = relativeDue(a.due_at);
                    return (
                      <li key={a.id} className="px-3.5 py-3">
                        <Link href={'/onyx/assignments/' + a.id}
                          className="text-[14px] font-semibold hover:underline">
                          {a.title}
                        </Link>
                        <div className="mt-1">
                          {/* Relative, not a locale timestamp. What a learner
                              scans a due list for is what is urgent, and
                              "8/17/2026, 12:00:00 AM" makes that a calculation. */}
                          <Pill tone={when.tone}>{when.text}</Pill>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ) : null}

          {/* LRN-03: "faculty must capture session attendance" -- the QR
              screen existed, but nothing could create the session it needs. */}
          {isStaff(me.role) ? (
            <section>
              <h2 className="mb-2 text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                Attendance
              </h2>
              <CreatePanel
                title="New session" cta="Open a session" icon="calendar" compact
                endpoint={'courses/' + id + '/attendance'}
                fields={[
                  { name: 'title', label: 'Session', required: true, wide: true,
                    placeholder: 'Lecture 4' },
                  { name: 'scheduled_at', label: 'When', type: 'datetime', required: true },
                  { name: 'duration_minutes', label: 'Minutes', type: 'number', min: 5,
                    max: 600, fallback: 60 },
                  { name: 'qr_window_seconds', label: 'Code rotates every (s)', type: 'number',
                    min: 10, max: 300, fallback: 15,
                    help: 'The check-in code changes on this cycle. A code is accepted for its own cycle and the next one, so a photograph of the screen is dead within two.' },
                ]}
              />
              {/* LRN-03c: the percentages and the export. Reachable from the
                  course rather than from a menu, because "who is short of
                  attendance" is a question about one course at a time. */}
              <Link
                href={'/onyx/courses/' + id + '/attendance'}
                className="mt-2 inline-flex min-h-[34px] items-center rounded-2xl border
                           border-line px-3 text-sm font-medium text-slate-700 hover:bg-brand-50"
              >
                Attendance report
              </Link>
            </section>
          ) : null}

          {sessions?.length ? (
            <section>
              <h2 className="text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                Sessions
              </h2>
              <Card className="mt-2">
                <ul className="divide-y divide-line">
                  {sessions.slice(0, 5).map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-3.5 py-2.5">
                      <span className="min-w-0 flex-1">
                        <Link href={'/onyx/courses/' + id + '/attendance/' + s.id}
                          className="block truncate text-[14px] font-semibold hover:underline">
                          {s.title}
                        </Link>
                        <span className="text-[12.5px] text-muted">
                          {/* A day and a time, not "11/8/2026, 12:11:13 am".
                              Seconds have never told anybody when a lecture is. */}
                          {new Date(s.scheduled_at).toLocaleDateString(undefined, {
                            weekday: 'short', day: 'numeric', month: 'short',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </span>
                      {s.status === 'open'
                        ? <Pill tone="good">Open</Pill>
                        : <Pill tone="neutral">Closed</Pill>}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}

          {resources?.length ? (
            <section>
              <h2 className="text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
                Resources
              </h2>
              <ul className="mt-2 space-y-1 text-sm">
                {resources.map((r) => (
                  <li key={r.id}><ResourceLink resource={r} /></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Download links are issued when you click and expire in five minutes.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </OnyxShell>
  );
}
