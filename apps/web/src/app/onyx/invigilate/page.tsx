import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';

export const metadata: Metadata = { title: 'Invigilate' };

interface QueueRow {
  attempt_id: number; assessment_id: number; user_id: number; status: string;
  integrity_flags: number; integrity_status: string; open_events: number;
}

/** ASS-02b -- everything an invigilator has to look at, worst first. */
export default async function OnyxInvigilatePage() {
  await requireOnyxPageRole('admin', 'faculty', 'exams');
  const [me, queue] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<QueueRow[]>('/api/onyx/proctor/queue'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Invigilation"
      subtitle="Attempts with something worth a look, most flagged first."
    >
      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[.06em] text-muted">
            <tr>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Still open</th>
              <th className="px-4 py-3">State</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((r) => (
              <tr key={r.attempt_id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={'/onyx/attempts/' + r.attempt_id + '/integrity'}
                    className="hover:underline">
                    Attempt {r.attempt_id}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums">{r.integrity_flags}</td>
                <td className="px-4 py-3 tabular-nums">{r.open_events}</td>
                <td className="px-4 py-3 capitalize text-muted">{r.integrity_status}</td>
              </tr>
            ))}
            {queue.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Nothing to review.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </OnyxShell>
  );
}
