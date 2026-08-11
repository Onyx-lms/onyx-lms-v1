import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import type { Batch, Program, Semester } from '@/lib/onyx-learn';
import { CreatePanel } from '@/components/onyx-create';

export const metadata: Metadata = { title: 'Programmes' };

/**
 * LRN-01a -- the academic structure.
 *
 * Read-only here: creating programmes, semesters and batches is done through
 * the API, and putting a builder on this page before O07 (Campus operations
 * defines the timetable model) would mean rebuilding it then.
 */
export default async function OnyxProgramsPage() {
  await requireOnyxPageRole('admin', 'faculty');
  const [me, programs, semesters, batches] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Program[]>('/api/onyx/programs'),
    onyxApi<Semester[]>('/api/onyx/semesters'),
    onyxApi<Batch[]>('/api/onyx/batches'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Programmes"
      subtitle="What this institution teaches, and the cohorts taking it."
    >
      {/* CMP-01: "manage programs, batches, timetables and faculty
          allocation from a central console". The console listed them and
          could create none of them. */}
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <CreatePanel
          title="New programme" cta="Add a programme" icon="building" compact
          endpoint="programs"
          fields={[
            { name: 'name', label: 'Programme', required: true, wide: true,
              placeholder: 'Computer Science' },
            { name: 'code', label: 'Code', required: true, placeholder: 'CS' },
            { name: 'duration_semesters', label: 'Semesters', type: 'number', min: 1,
              max: 20, fallback: 6 },
            { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
          ]}
        />
        <CreatePanel
          title="New semester" cta="Add a semester" icon="calendar" compact
          endpoint="semesters"
          fields={[
            { name: 'program_id', label: 'Programme', type: 'select', required: true, numeric: true,
              options: programs.map((p) => ({ value: String(p.id), label: p.name })) },
            { name: 'name', label: 'Name', required: true, placeholder: 'Term 1 2026' },
            { name: 'number', label: 'Number', type: 'number', min: 1, max: 20, fallback: 1 },
            { name: 'starts_on', label: 'Starts', type: 'date' },
            { name: 'ends_on', label: 'Ends', type: 'date' },
          ]}
        />
        <CreatePanel
          title="New batch" cta="Add a batch" icon="users" compact
          endpoint="batches"
          fields={[
            { name: 'program_id', label: 'Programme', type: 'select', required: true, numeric: true,
              options: programs.map((p) => ({ value: String(p.id), label: p.name })) },
            { name: 'name', label: 'Batch', required: true, placeholder: 'Batch A 2026' },
            { name: 'code', label: 'Code', required: true, placeholder: 'BA26' },
            { name: 'year', label: 'Year', type: 'number', min: 1900, max: 2200 },
          ]}
        />
      </div>
      {programs.length === 0 ? (
        <p className="text-sm text-muted">No programmes yet.</p>
      ) : (
        <ul className="space-y-6">
          {programs.map((p) => {
            const theirs = semesters.filter((s) => s.program_id === p.id);
            const cohorts = batches.filter((b) => b.program_id === p.id);
            return (
              <li key={p.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-medium">{p.name}</h2>
                  <span className="font-mono text-xs text-muted">{p.code}</span>
                </div>
                {p.description ? (
                  <p className="mt-1 text-sm text-muted">{p.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  {p.duration_semesters} semester{p.duration_semesters === 1 ? '' : 's'}
                </p>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted">Semesters</div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {theirs.map((s) => (
                        <li key={s.id}>
                          {s.number}. {s.name}
                          {s.starts_on ? (
                            <span className="ml-2 text-xs text-muted">
                              from {s.starts_on}
                            </span>
                          ) : null}
                        </li>
                      ))}
                      {theirs.length === 0
                        ? <li className="text-muted">None defined.</li>
                        : null}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted">Batches</div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {cohorts.map((b) => (
                        <li key={b.id}>
                          {b.name}
                          <span className="ml-2 font-mono text-xs text-muted">{b.code}</span>
                        </li>
                      ))}
                      {cohorts.length === 0
                        ? <li className="text-muted">None yet.</li>
                        : null}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </OnyxShell>
  );
}
