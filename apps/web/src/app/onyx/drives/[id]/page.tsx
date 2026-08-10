import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { DriveSummary } from '@/lib/onyx-career';

export const metadata: Metadata = { title: 'Drive' };

/**
 * CAR-04c -- one drive, and whether its rounds and its offers agree.
 *
 * The reconciliation is reported rather than corrected. An offer made outside
 * the last round is a real thing that happens; the platform's job is to say so,
 * not to pretend it did not.
 */
export default async function OnyxDrivePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxPageRole('admin', 'placement');
  const { id } = await params;
  const [me, summary, members] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<DriveSummary>('/api/onyx/drives/' + id + '/summary'),
    onyxApiSafe<{ user_id: number; user: { name: string } | null }[]>('/api/onyx/members'),
  ]);
  const names = new Map((members ?? [])
    .map((m) => [Number(m.user_id), m.user?.name ?? ('User ' + m.user_id)]));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={summary.drive.title}
      subtitle={summary.drive.scheduled_at
        ? new Date(summary.drive.scheduled_at).toLocaleString()
        : 'Not scheduled'}
    >
      <Link href="/onyx/placement" className="text-sm text-muted hover:underline">
        &larr; Placement
      </Link>

      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Rounds</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Round</th>
                <th className="px-4 py-3">Attended</th>
                <th className="px-4 py-3">Absent</th>
                <th className="px-4 py-3">Passed</th>
                <th className="px-4 py-3">Failed</th>
              </tr>
            </thead>
            <tbody>
              {summary.rounds.map((r) => (
                <tr key={r.round_id} className="border-t border-line">
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3 tabular-nums">{r.attended}</td>
                  <td className="px-4 py-3 tabular-nums">{r.absent}</td>
                  <td className="px-4 py-3 tabular-nums">{r.passed}</td>
                  <td className="px-4 py-3 tabular-nums">{r.failed}</td>
                </tr>
              ))}
              {summary.rounds.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No rounds defined.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Rounds against offers
        </h2>
        <div className={'mt-3 rounded-xl border p-4 text-sm '
          + (summary.reconciles ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50')}>
          <p className="font-medium">
            {summary.cleared_final_round} cleared the last round; {summary.offers} offer
            {summary.offers === 1 ? '' : 's'} recorded.
          </p>
          {summary.reconciles ? (
            <p className="mt-1 text-emerald-900">These agree.</p>
          ) : (
            <div className="mt-2 space-y-1 text-amber-900">
              {summary.cleared_without_offer.length ? (
                <p>
                  Cleared but no offer:{' '}
                  {summary.cleared_without_offer.map((u) => names.get(u) ?? u).join(', ')}
                </p>
              ) : null}
              {summary.offered_without_clearing.length ? (
                <p>
                  Offered without clearing the last round:{' '}
                  {summary.offered_without_clearing.map((u) => names.get(u) ?? u).join(', ')}
                </p>
              ) : null}
              <p className="text-xs">
                Neither is necessarily wrong &mdash; this is here so it is a decision
                rather than a surprise.
              </p>
            </div>
          )}
        </div>
      </section>
    </OnyxShell>
  );
}
