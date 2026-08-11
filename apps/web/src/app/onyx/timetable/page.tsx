import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { WEEKDAYS, hhmm, type Room, type TimetableSlot } from '@/lib/onyx-campus';
import type { Course } from '@/lib/onyx-learn';
import { CreatePanel } from '@/components/onyx-create';

export const metadata: Metadata = { title: 'Timetable' };

const REGISTRY = ['admin'];

/**
 * CMP-01b -- the grid, and the console that builds it.
 *
 * A learner or faculty member only ever receives the published rows: the API
 * filters that, not this page, so there is nothing here that could show a
 * draft by accident. An administrator sees drafts too, marked as such, because
 * building next term's timetable means looking at it before it is published.
 *
 * The rooms, the classes and the publish step are all here for the same
 * reason: this page used to tell a registrar to "publish from the registry
 * console" and there was no such console anywhere in the product.
 */
export default async function OnyxTimetablePage() {
  await requireOnyxSession();
  const me = await onyxApi<Me>('/api/onyx/me');
  const registry = REGISTRY.includes(me.role);

  const [slots, rooms, courses, semesters, batches, members] = await Promise.all([
    onyxApi<TimetableSlot[]>('/api/onyx/timetable'),
    onyxApiSafe<Room[]>('/api/onyx/rooms'),
    onyxApiSafe<Course[]>('/api/onyx/courses'),
    registry ? onyxApiSafe<{ id: number; name: string }[]>('/api/onyx/semesters') : null,
    registry ? onyxApiSafe<{ id: number; name: string }[]>('/api/onyx/batches') : null,
    registry
      ? onyxApiSafe<{ user_id: number; role: string; user: { name: string } | null }[]>(
        '/api/onyx/members')
      : null,
  ]);

  // Rows read as "Discrete Mathematics in Lab 2", not as a pair of ids. The
  // ids are the database's business, not the registrar's.
  const courseName = new Map((courses ?? []).map((c) => [c.id, c.code + ' — ' + c.title]));
  const roomName = new Map((rooms ?? []).map((r) => [r.id, r.code + ' — ' + r.name]));
  const teachers = (members ?? []).filter((m) => m.role === 'faculty');

  const byDay = new Map<number, TimetableSlot[]>();
  for (const s of slots) {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week)!.push(s);
  }

  const idOptions = <T extends { id: number }>(rows: T[] | null, label: (r: T) => string) =>
    (rows ?? []).map((r) => ({ value: String(r.id), label: label(r) }));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Timetable"
      subtitle={registry
        ? 'Drafts are marked. Publish once every clash is clear.'
        : 'Published sessions only.'}
    >
      {registry ? (
        <div className="mb-6 flex flex-wrap items-start gap-3">
          <CreatePanel
            title="New room" cta="Add a room" icon="building" compact
            endpoint="rooms"
            fields={[
              { name: 'code', label: 'Code', required: true, placeholder: 'LT1' },
              { name: 'name', label: 'Name', required: true, placeholder: 'Lecture Theatre 1' },
              { name: 'capacity', label: 'Seats', type: 'number', min: 0, max: 5000,
                fallback: 60 },
              { name: 'kind', label: 'Kind', type: 'select', fallback: 'lecture',
                options: ['lecture', 'lab', 'seminar', 'hall']
                  .map((k) => ({ value: k, label: k })) },
              { name: 'building', label: 'Building', placeholder: 'Main block' },
            ]}
          />
          <CreatePanel
            title="Schedule a class" cta="Schedule a class" icon="calendar" compact
            endpoint="timetable"
            // CMP-01b: the POST refuses a clash and names it. This says so
            // while the registrar can still change the answer, which is the
            // difference between one form and forty.
            watch="timetable-clash"
            fields={[
              { name: 'semester_id', label: 'Semester', type: 'select', required: true,
                numeric: true, options: idOptions(semesters, (s) => s.name) },
              { name: 'course_id', label: 'Course', type: 'select', required: true,
                numeric: true, options: idOptions(courses, (c) => c.code + ' — ' + c.title) },
              { name: 'batch_id', label: 'Batch', type: 'select', required: true,
                numeric: true, options: idOptions(batches, (b) => b.name) },
              { name: 'room_id', label: 'Room', type: 'select', required: true,
                numeric: true, options: idOptions(rooms, (r) => r.code + ' — ' + r.name) },
              { name: 'faculty_id', label: 'Teacher', type: 'select', required: true,
                numeric: true, wide: true,
                options: teachers.map((m) => ({ value: String(m.user_id),
                  label: m.user?.name ?? 'User ' + m.user_id })) },
              { name: 'day_of_week', label: 'Day', type: 'select', required: true,
                numeric: true,
                options: WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d })) },
              { name: 'starts_at', label: 'From', type: 'time', required: true },
              { name: 'ends_at', label: 'To', type: 'time', required: true,
                help: 'A clash — the room, the teacher or the batch — is refused and named.' },
            ]}
          />
          <CreatePanel
            title="Publish the timetable" cta="Publish a semester" icon="check" compact
            endpoint="timetable/publish"
            fields={[
              { name: 'semester_id', label: 'Semester', type: 'select', required: true,
                numeric: true, wide: true, options: idOptions(semesters, (s) => s.name),
                help: 'Every draft row for that semester becomes visible to learners at once.' },
            ]}
          />
        </div>
      ) : null}

      <div className="space-y-6">
        {WEEKDAYS.map((day, i) => {
          const dayNum = i + 1;
          const rows = (byDay.get(dayNum) ?? [])
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          if (!rows.length) return null;
          return (
            <section key={dayNum}>
              <h2 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[.085em]
                             text-muted">{day}</h2>
              <table className="w-full overflow-hidden rounded-2xl border border-line bg-white
                                text-sm shadow-card">
                <caption className="sr-only">{day}&apos;s scheduled classes</caption>
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide
                                 text-muted">
                    <th scope="col" className="px-4 py-2.5 font-bold">Time</th>
                    <th scope="col" className="px-4 py-2.5 font-bold">Course</th>
                    <th scope="col" className="px-4 py-2.5 font-bold">Room</th>
                    {registry ? <th scope="col" className="px-4 py-2.5 font-bold">Status</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      {/* The time is what a person scans a timetable for, so it
                          carries the weight rather than matching the room. */}
                      <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums">
                        {hhmm(s.starts_at)}&ndash;{hhmm(s.ends_at)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {courseName.get(s.course_id) ?? 'Course #' + s.course_id}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {roomName.get(s.room_id) ?? 'Room #' + s.room_id}
                      </td>
                      {registry ? (
                        <td className="px-4 py-3 text-xs text-muted">
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
            {registry
              ? 'Nothing scheduled yet. Add a room, then schedule a class against it.'
              : 'Nothing published yet.'}
          </p>
        ) : null}
      </div>
    </OnyxShell>
  );
}
