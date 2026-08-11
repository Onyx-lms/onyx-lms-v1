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
            <div className="rounded-2xl border border-line p-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Your progress</span>
                <span className="tabular-nums text-muted">
                  {outline.progress.completed} of {outline.progress.total} lessons
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={outline.progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Course progress"
              >
                <div className="h-full bg-brand-600" style={{ width: outline.progress.percent + '%' }} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="text-sm text-muted">
                You are not enrolled in this course. Preview lessons are open; the rest is not.
              </p>
              {outline.course.self_enroll && me.role === 'student' ? (
                <div className="mt-3">
                  <ActionButton endpoint={'courses/' + id + '/enroll'} label="Join this course" />
                </div>
              ) : null}
            </div>
          )}

          {outline.modules.map((m) => (
            <section key={m.id}>
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                {m.title}
              </h2>
              {m.summary ? <p className="mt-1 text-sm text-muted">{m.summary}</p> : null}
              <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                {m.lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1">
                      {l.locked ? (
                        <span className="text-muted">{l.title}</span>
                      ) : (
                        <Link href={'/onyx/courses/' + id + '/lessons/' + l.id}
                          className="hover:underline">
                          {l.title}
                        </Link>
                      )}
                      {l.is_preview ? <span className="ml-2 text-xs text-muted">preview</span> : null}
                    </span>
                    {l.duration_seconds ? (
                      <span className="text-xs tabular-nums text-muted">
                        {formatDuration(l.duration_seconds)}
                      </span>
                    ) : null}
                    {l.completed_at ? <span className="text-xs text-emerald-700">done</span> : null}
                    {l.locked ? <span className="text-xs text-muted">locked</span> : null}
                  </li>
                ))}
                {m.lessons.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-muted">Nothing here yet.</li>
                ) : null}
              </ul>
            </section>
          ))}

          {outline.modules.length === 0 ? (
            <p className="text-sm text-muted">This course has no content yet.</p>
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
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                  Questions
                </h2>
                <OnyxAskForm courseId={Number(id)} />
              </div>
              <ul className="mt-3 space-y-2">
                {(discussions ?? []).map((d) => (
                  <li key={d.id} className="rounded-2xl border border-line p-3">
                    <Link href={'/onyx/discussions/' + d.id}
                      className="text-sm font-medium hover:underline">
                      {d.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted">
                      {d.status === 'resolved' ? 'resolved' : d.status} · {d.reply_count}
                      {' '}{d.reply_count === 1 ? 'reply' : 'replies'}
                    </div>
                  </li>
                ))}
                {(discussions ?? []).length === 0 ? (
                  <li className="text-sm text-muted">Nobody has asked anything yet.</li>
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
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
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
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
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
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Due</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {due.map((a) => (
                  <li key={a.id}>
                    <Link href={'/onyx/assignments/' + a.id} className="hover:underline">
                      {a.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {new Date(a.due_at!).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* LRN-03: "faculty must capture session attendance" -- the QR
              screen existed, but nothing could create the session it needs. */}
          {isStaff(me.role) ? (
            <section>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
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
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                Sessions
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {sessions.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={'/onyx/courses/' + id + '/attendance/' + s.id}
                      className="hover:underline">
                      {s.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {new Date(s.scheduled_at).toLocaleString()}
                      {s.status === 'open' ? '' : ' · closed'}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {resources?.length ? (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
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
