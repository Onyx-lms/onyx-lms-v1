import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { Exam } from '@/lib/onyx-campus';
import { CreatePanel } from '@/components/onyx-create';
import { onyxApiSafe } from '@/lib/onyx-session';
import type { Course, Semester } from '@/lib/onyx-learn';

export const metadata: Metadata = { title: 'Examinations' };

/** CMP-02a -- the calendar. */
export default async function OnyxExamsPage() {
  await requireOnyxSession();
  const [me, exams, courses, semesters] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Exam[]>('/api/onyx/exams'),
    onyxApiSafe<Course[]>('/api/onyx/courses'),
    onyxApiSafe<Semester[]>('/api/onyx/semesters'),
  ]);
  const canSchedule = me.role === 'admin' || me.role === 'exams';

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Examinations"
      subtitle="No learner is ever scheduled for two papers at once -- the calendar refuses that before it happens."
    >
      {/* CMP-02: "schedule exams, assign halls and seats, enter marks and
          generate transcripts end-to-end" -- none of which could be started
          from the product. */}
      {canSchedule ? (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          <CreatePanel
            title="Schedule an exam" cta="Schedule an exam" icon="award" compact
            endpoint="exams"
            fields={[
              { name: 'title', label: 'Exam', required: true, wide: true,
                placeholder: 'CS101 Final' },
              { name: 'course_id', label: 'Course', type: 'select', required: true, numeric: true,
                options: (courses ?? []).map((c) => ({ value: String(c.id),
                  label: c.code + ' — ' + c.title })) },
              { name: 'semester_id', label: 'Semester', type: 'select', required: true, numeric: true,
                options: (semesters ?? []).map((sm) => ({ value: String(sm.id),
                  label: sm.name })) },
              { name: 'starts_at', label: 'Starts', type: 'datetime', required: true },
              { name: 'duration_minutes', label: 'Minutes', type: 'number', min: 5,
                max: 600, fallback: 180 },
              { name: 'max_marks', label: 'Out of', type: 'number', min: 1, max: 1000,
                fallback: 100 },
              { name: 'pass_marks', label: 'Pass mark', type: 'number', min: 0, max: 1000,
                fallback: 40,
                help: 'Nobody is scheduled for two exams at once — a clash is refused, naming who it caught.' },
            ]}
          />
          <CreatePanel
            title="New hall" cta="Add a hall" icon="building" compact
            endpoint="halls"
            fields={[
              { name: 'code', label: 'Code', required: true, placeholder: 'H1' },
              { name: 'name', label: 'Name', required: true, placeholder: 'Main Hall' },
              { name: 'row_count', label: 'Rows', type: 'number', min: 1, max: 100,
                required: true },
              { name: 'col_count', label: 'Columns', type: 'number', min: 1, max: 100,
                required: true },
              { name: 'capacity', label: 'Usable seats', type: 'number', min: 1, max: 5000,
                help: 'May be fewer than rows × columns once gangways are left clear.' },
            ]}
          />
        </div>
      ) : null}
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {exams.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <Link href={'/onyx/exams/' + e.id} className="font-medium hover:underline">
                {e.title}
              </Link>
              <div className="text-xs text-muted">
                {new Date(e.starts_at).toLocaleString()} · {e.duration_minutes} minutes
                · out of {e.max_marks}
              </div>
            </div>
            <span className="text-xs text-muted">{e.status}</span>
          </li>
        ))}
        {exams.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted">Nothing scheduled.</li>
        ) : null}
      </ul>
    </OnyxShell>
  );
}
