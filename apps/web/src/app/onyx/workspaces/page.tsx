import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import {
  ActionLink, Card, CardGrid, Empty, Icon, Pill, SectionHead,
} from '@/components/onyx-ui';
import { OnyxNewWorkspace } from '@/components/onyx-workspace-new';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { Course } from '@/lib/onyx-learn';
import type { Workspace } from '@/lib/onyx-codelab';

export const metadata: Metadata = { title: 'Workspaces' };

/**
 * A past date, said the way a person says it.
 *
 * `relativeDue` in the kit reads forwards -- "tomorrow", "2 days late" -- which
 * is the wrong tense for "when did I last touch this". Same principle, other
 * direction: what someone scans this list for is which project is still warm,
 * and `8/17/2026, 12:00:00 AM` makes that a calculation.
 */
function since(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'Never opened';
  const mins = Math.round((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  const weeks = Math.round(days / 7);
  if (weeks === 1) return 'last week';
  if (weeks < 5) return weeks + ' weeks ago';
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? 'a month ago' : months + ' months ago';
  return new Date(t).toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric' });
}

/** LAB-05 -- a learner's project workspaces. */
export default async function OnyxWorkspacesPage() {
  await requireOnyxSession();
  const [me, workspaces, courses] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Workspace[]>('/api/onyx/workspaces'),
    onyxApi<Course[]>('/api/onyx/my/courses'),
  ]);

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const attached = workspaces.filter((w) => w.course_id !== null).length;
  const languages = [...new Set(workspaces.map((w) => w.language).filter(Boolean))];
  // Newest first without mutating the response: a project you touched an hour
  // ago is the one you came back for.
  const recent = [...workspaces].sort(
    (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Workspaces"
      subtitle="Multi-file projects, with snapshots you can go back to."
    >
      <OnyxNewWorkspace courses={courses} />

      {workspaces.length ? (
        <div className="mt-6">
          <CardGrid min="12rem">
            <Stat label="Projects" value={workspaces.length}
              note={attached ? attached + ' attached to a course' : 'None on a course'} />
            <Stat label="Languages" value={languages.length}
              note={languages.join(', ')} />
            <Stat label="Last worked on" value={since(recent[0]!.updated_at)}
              note={recent[0]!.title} />
          </CardGrid>
        </div>
      ) : null}

      {/* A card grid rather than a row list: a project is recognised by its
          name and its language together, and the language is the thing being
          scanned for -- "where is my Python one" -- which a single-line row
          buries at the end of the line. */}
      <div className="mt-6">
        <SectionHead title={'Your workspaces · ' + workspaces.length} />

        {recent.length ? (
          <ul className="grid list-none gap-3.5"
            aria-label="Your workspaces"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(17rem, 100%), 1fr))' }}>
            {recent.map((w) => {
              const course = w.course_id === null ? null : courseById.get(w.course_id);
              return (
                // The cards stretch to a common height in each row, so the
                // footer sits on the bottom rather than floating under
                // whichever card happened to have the shortest body.
                <Card key={w.id} as="li" className="flex min-w-0 flex-col">
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl
                                       bg-brand-50 text-brand-700">
                        <Icon name="layers" className="h-[18px] w-[18px]" />
                      </span>
                      <Pill>{w.language}</Pill>
                    </div>

                    <h3 className="mt-3 text-[15.5px] font-bold">
                      <Link href={'/onyx/workspaces/' + w.id}
                        className="hover:underline">{w.title}</Link>
                    </h3>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {course
                        ? course.code + ' ' + course.title
                        : 'Personal project · no course'}
                    </p>

                    <dl className="mt-3 grid gap-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[12.5px] text-muted">Entry file</dt>
                        <dd className="min-w-0 truncate font-mono text-[13px] font-semibold">
                          {w.entry_path}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line
                                  px-4 py-3">
                    <span className="min-w-0 flex-1 text-[13px] text-muted">
                      Opened {since(w.updated_at)}
                    </span>
                    <ActionLink href={'/onyx/workspaces/' + w.id} label="Open" tone="quiet" />
                  </div>
                </Card>
              );
            })}
          </ul>
        ) : (
          <Card>
            <Empty icon="layers">
              No projects yet. Start one above and it keeps its own files and snapshots.
            </Empty>
          </Card>
        )}
      </div>
    </OnyxShell>
  );
}

/** A stat tile. Not `StatTile` from the kit: the value here is sometimes a
 *  phrase ("2 hours ago") rather than a numeral, so it is set smaller. */
function Stat({ label, value, note }: {
  label: string; value: string | number; note?: string;
}) {
  return (
    <Card className="p-3.5">
      <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-muted">{label}</div>
      <div className="mt-1.5 text-[19px] font-extrabold leading-tight tabular-nums">{value}</div>
      {note ? <div className="mt-1 truncate text-xs text-muted" title={note}>{note}</div> : null}
    </Card>
  );
}
