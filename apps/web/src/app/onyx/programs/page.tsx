import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import type { Batch, Program, Semester } from '@/lib/onyx-learn';

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
      {programs.length === 0 ? (
        <p className="text-sm text-slate-500">No programmes yet.</p>
      ) : (
        <ul className="space-y-6">
          {programs.map((p) => {
            const theirs = semesters.filter((s) => s.program_id === p.id);
            const cohorts = batches.filter((b) => b.program_id === p.id);
            return (
              <li key={p.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-medium">{p.name}</h2>
                  <span className="font-mono text-xs text-slate-500">{p.code}</span>
                </div>
                {p.description ? (
                  <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  {p.duration_semesters} semester{p.duration_semesters === 1 ? '' : 's'}
                </p>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Semesters</div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {theirs.map((s) => (
                        <li key={s.id}>
                          {s.number}. {s.name}
                          {s.starts_on ? (
                            <span className="ml-2 text-xs text-slate-500">
                              from {s.starts_on}
                            </span>
                          ) : null}
                        </li>
                      ))}
                      {theirs.length === 0
                        ? <li className="text-slate-500">None defined.</li>
                        : null}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Batches</div>
                    <ul className="mt-1 space-y-1 text-sm">
                      {cohorts.map((b) => (
                        <li key={b.id}>
                          {b.name}
                          <span className="ml-2 font-mono text-xs text-slate-500">{b.code}</span>
                        </li>
                      ))}
                      {cohorts.length === 0
                        ? <li className="text-slate-500">None yet.</li>
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
