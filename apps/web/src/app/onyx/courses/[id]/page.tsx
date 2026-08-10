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
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">
              You are not enrolled in this course. Preview lessons are open; the rest is not.
            </p>
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
