import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import { WEEKDAYS, hhmm, type TimetableSlot } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Timetable' };

const REGISTRY = ['admin'];

/**
 * CMP-01b -- the grid.
 *
 * A learner or faculty member only ever receives the published rows: the API
 * filters that, not this page, so there is nothing here that could show a
 * draft by accident. An administrator sees drafts too, marked as such, because
 * building next term's timetable means looking at it before it is published.
 */
export default async function OnyxTimetablePage() {
  await requireOnyxSession();
  const me = await onyxApi<Me>('/api/onyx/me');
  const registry = REGISTRY.includes(me.role);

  const slots = await onyxApi<TimetableSlot[]>('/api/onyx/timetable');
  const byDay = new Map<number, TimetableSlot[]>();
  for (const s of slots) {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week)!.push(s);
  }

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Timetable"
      subtitle={registry
        ? 'Drafts are marked. Publish from the registry console once every clash is clear.'
        : 'Published sessions only.'}
    >
      <div className="space-y-6">
        {WEEKDAYS.map((day, i) => {
          const dayNum = i + 1;
          const rows = (byDay.get(dayNum) ?? [])
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          if (!rows.length) return null;
          return (
            <section key={dayNum}>
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{day}</h2>
              <table className="mt-2 w-full text-sm">
                <caption className="sr-only">{day}&apos;s scheduled classes</caption>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1 pr-3">Time</th>
                    <th scope="col" className="py-1 pr-3">Course</th>
                    <th scope="col" className="py-1 pr-3">Room</th>
                    {registry ? <th scope="col" className="py-1">Status</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 pr-3 tabular-nums">
                        {hhmm(s.starts_at)}&ndash;{hhmm(s.ends_at)}
                      </td>
                      <td className="py-2 pr-3">Course #{s.course_id}</td>
                      <td className="py-2 pr-3">Room #{s.room_id}</td>
                      {registry ? (
                        <td className="py-2 text-xs text-muted">
                          {s.status === 'draft' ? 'draft' : 'published'}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
        {slots.length === 0 ? (
          <p className="text-sm text-muted">
            {registry ? 'Nothing scheduled yet.' : 'No timetable has been published yet.'}
          </p>
        ) : null}
      </div>
    </OnyxShell>
  );
}
