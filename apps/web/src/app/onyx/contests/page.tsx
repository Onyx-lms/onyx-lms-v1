import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { Empty, ListRow, Pill, RowList } from '@/components/onyx-ui';
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
      {/* Running is the state that changes what you do, so it is a chip and
          it is first. The old row put it in grey text at the end of the line
          alongside "draft", which read as the same kind of fact. */}
      <RowList label="Contests">
        {contests.map((c) => {
          const started = Date.parse(c.starts_at) <= now;
          const ended = Date.parse(c.ends_at) <= now;
          const fmt = (t: string) => new Date(t).toLocaleDateString(undefined,
            { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
          return (
            <ListRow
              key={c.id}
              icon="trophy"
              tone={ended ? 'neutral' : started ? 'brand' : 'neutral'}
              title={c.title}
              href={'/onyx/contests/' + c.id}
              chips={
                <>
                  {ended ? <Pill tone="neutral">Finished</Pill>
                    : started ? <Pill tone="brand">Running</Pill>
                      : <Pill tone="soon">Not started</Pill>}
                  {c.status === 'draft' ? <Pill tone="neutral">Draft</Pill> : null}
                </>
              }
              meta={
                <span className="flex flex-wrap items-center gap-x-3">
                  <span>{fmt(c.starts_at)} &ndash; {fmt(c.ends_at)}</span>
                  <span>{c.team_size > 1 ? 'Teams of up to ' + c.team_size : 'Individual'}</span>
                  {c.freeze_minutes ? (
                    <span>Board freezes for the last {c.freeze_minutes} minutes</span>
                  ) : null}
                </span>
              }
              action={{ href: '/onyx/contests/' + c.id,
                label: started && !ended ? 'Compete' : 'Open' }}
            />
          );
        })}
        {contests.length === 0 ? (
          <li><Empty icon="trophy">Nothing is scheduled.</Empty></li>
        ) : null}
      </RowList>
    </OnyxShell>
  );
}
