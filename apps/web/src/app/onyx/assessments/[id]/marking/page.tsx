import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import type { Assessment, MarkingQueueRow } from '@/lib/onyx-assess';

export const metadata: Metadata = { title: 'Marking' };

/** ASS-03a -- the marking queue, anonymised where the assessment says so. */
export default async function OnyxMarkingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxPageRole('admin', 'faculty', 'exams');
  const { id } = await params;
  const [me, assessment, queue] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Assessment>('/api/onyx/assessments/' + id),
    onyxApi<MarkingQueueRow[]>('/api/onyx/assessments/' + id + '/marking'),
  ]);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={'Marking: ' + assessment.title}
      subtitle={assessment.anonymous_marking
        ? 'Candidates are not named on this paper.'
        : 'Candidates are named on this paper.'}
    >
      <Link href={'/onyx/assessments/' + id} className="text-sm text-slate-600 hover:underline">
        &larr; Back to the assessment
      </Link>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Handed in</th>
              <th className="px-4 py-3">Auto</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Integrity</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={'/onyx/attempts/' + a.id + '/mark'} className="hover:underline">
                    {a.candidate ?? ('User ' + a.user_id)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '-'}
                  {a.status === 'expired'
                    ? <span className="ml-2 text-xs text-amber-700">ran out of time</span>
                    : null}
                </td>
                <td className="px-4 py-3 tabular-nums">{a.auto_score ?? '-'}</td>
                <td className="px-4 py-3 tabular-nums">
                  {a.score === null ? 'not marked' : a.score + ' / ' + a.max_score}
                </td>
                <td className="px-4 py-3">
                  {a.integrity_flags > 0 ? (
                    <Link href={'/onyx/attempts/' + a.id + '/integrity'}
                      className="text-amber-700 hover:underline">
                      {a.integrity_flags} &middot; {a.integrity_status}
                    </Link>
                  ) : <span className="text-slate-400">clean</span>}
                </td>
              </tr>
            ))}
            {queue.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Nothing handed in yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </OnyxShell>
  );
}
