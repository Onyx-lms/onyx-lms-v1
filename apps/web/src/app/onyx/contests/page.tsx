import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { Contest } from '@/lib/onyx-career';
import { CreatePanel } from '@/components/onyx-create';

export const metadata: Metadata = { title: 'Contests' };

/** CAR-01 -- hackathons and contests. */
export default async function OnyxContestsPage() {
  await requireOnyxSession();
  const [me, contests] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Contest[]>('/api/onyx/contests'),
  ]);
  const now = Date.now();

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Contests"
      subtitle="Timed events, judged by the same evaluator as Code Lab."
    >
      {/* CAR-01: "administrators must host timed events with team formation,
          leaderboards and judging". */}
      {me.role === 'admin' || me.role === 'placement' ? (
        <div className="mb-6">
          <CreatePanel
            title="New contest" cta="Host a contest" icon="trophy"
            endpoint="contests"
            fields={[
              { name: 'title', label: 'Contest', required: true, wide: true,
                placeholder: 'Autumn Hackathon' },
              { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
              { name: 'starts_at', label: 'Starts', type: 'datetime', required: true },
              { name: 'ends_at', label: 'Ends', type: 'datetime', required: true },
              { name: 'team_size', label: 'Team size', type: 'number', min: 1, max: 10,
                fallback: 1, help: '1 for an individual contest.' },
              { name: 'freeze_minutes', label: 'Freeze board for last (min)', type: 'number',
                min: 0, max: 600, fallback: 0 },
            ]}
          />
        </div>
      ) : null}
      <ul className="space-y-3">
        {contests.map((c) => {
          const started = Date.parse(c.starts_at) <= now;
          const ended = Date.parse(c.ends_at) <= now;
          return (
            <li key={c.id} className="rounded-2xl border border-line p-4">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={'/onyx/contests/' + c.id} className="font-medium hover:underline">
                  {c.title}
                </Link>
                <span className="text-xs text-muted">
                  {ended ? 'finished' : started ? 'running' : 'not started'}
                  {c.status === 'draft' ? ' · draft' : ''}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {new Date(c.starts_at).toLocaleString()} &ndash;{' '}
                {new Date(c.ends_at).toLocaleString()}
                {c.team_size > 1 ? ' · teams of up to ' + c.team_size : ' · individual'}
                {c.freeze_minutes
                  ? ' · board freezes for the last ' + c.freeze_minutes + ' minutes'
                  : ''}
              </div>
            </li>
          );
        })}
        {contests.length === 0 ? (
          <li className="text-sm text-muted">Nothing scheduled.</li>
        ) : null}
      </ul>
    </OnyxShell>
  );
}
