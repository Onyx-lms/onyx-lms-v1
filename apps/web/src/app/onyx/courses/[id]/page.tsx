import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { ResourceLink } from '@/components/onyx-player';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import {
  formatDuration, isStaff,
  type Assignment, type AttendanceSession, type Outline, type Resource,
} from '@/lib/onyx-learn';

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

  const [me, outline] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Outline>('/api/onyx/courses/' + id + '/outline'),
  ]);

  // A learner who is not enrolled sees the catalog view: the shape of the
  // course, and nothing that belongs to the people taking it.
  const visible = outline.enrolled || isStaff(me.role);
  const [assignments, sessions, resources] = visible
    ? await Promise.all([
      onyxApiSafe<Assignment[]>('/api/onyx/courses/' + id + '/assignments'),
      onyxApiSafe<AttendanceSession[]>('/api/onyx/courses/' + id + '/attendance'),
      onyxApiSafe<Resource[]>('/api/onyx/courses/' + id + '/resources'),
    ])
    : [null, null, null];

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
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Your progress</span>
                <span className="tabular-nums text-slate-600">
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
                <div className="h-full bg-slate-900" style={{ width: outline.progress.percent + '%' }} />
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              You are not enrolled in this course. Preview lessons are open; the rest is not.
            </p>
          )}

          {outline.modules.map((m) => (
            <section key={m.id}>
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                {m.title}
              </h2>
              {m.summary ? <p className="mt-1 text-sm text-slate-600">{m.summary}</p> : null}
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {m.lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1">
                      {l.locked ? (
                        <span className="text-slate-400">{l.title}</span>
                      ) : (
                        <Link href={'/onyx/courses/' + id + '/lessons/' + l.id}
                          className="hover:underline">
                          {l.title}
                        </Link>
                      )}
                      {l.is_preview ? <span className="ml-2 text-xs text-slate-500">preview</span> : null}
                    </span>
                    {l.duration_seconds ? (
                      <span className="text-xs tabular-nums text-slate-500">
                        {formatDuration(l.duration_seconds)}
                      </span>
                    ) : null}
                    {l.completed_at ? <span className="text-xs text-emerald-700">done</span> : null}
                    {l.locked ? <span className="text-xs text-slate-400">locked</span> : null}
                  </li>
                ))}
                {m.lessons.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-500">Nothing here yet.</li>
                ) : null}
              </ul>
            </section>
          ))}

          {outline.modules.length === 0 ? (
            <p className="text-sm text-slate-500">This course has no content yet.</p>
          ) : null}
        </div>

        <aside className="space-y-6">
          {due.length ? (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Due</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {due.map((a) => (
                  <li key={a.id}>
                    <Link href={'/onyx/assignments/' + a.id} className="hover:underline">
                      {a.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {new Date(a.due_at!).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {sessions?.length ? (
            <section>
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Sessions
              </h2>
              <ul className="mt-2 space-y-2 text-sm">
                {sessions.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={'/onyx/courses/' + id + '/attendance/' + s.id}
                      className="hover:underline">
                      {s.title}
                    </Link>
                    <div className="text-xs text-slate-500">
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
              <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Resources
              </h2>
              <ul className="mt-2 space-y-1 text-sm">
                {resources.map((r) => (
                  <li key={r.id}><ResourceLink resource={r} /></li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Download links are issued when you click and expire in five minutes.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </OnyxShell>
  );
}
