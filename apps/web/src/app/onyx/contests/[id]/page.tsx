import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxContestTeams } from '@/components/onyx-career';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { Contest, Leaderboard } from '@/lib/onyx-career';

export const metadata: Metadata = { title: 'Contest' };

/** CAR-01a -- one contest: the problems, the teams and the board. */
export default async function OnyxContestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnyxSession();
  const { id } = await params;
  const [me, contest, board] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<Contest>('/api/onyx/contests/' + id),
    onyxApi<Leaderboard>('/api/onyx/contests/' + id + '/leaderboard'),
  ]);
  const now = Date.now();
  const running = Date.parse(contest.starts_at) <= now && now < Date.parse(contest.ends_at);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={contest.title}
      subtitle={new Date(contest.starts_at).toLocaleString() + ' — '
        + new Date(contest.ends_at).toLocaleString()}
    >
      <Link href="/onyx/contests" className="text-sm text-muted hover:underline">
        &larr; All contests
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {contest.description ? (
            <article className="whitespace-pre-wrap text-sm text-slate-700">
              {contest.description}
            </article>
          ) : null}

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                Leaderboard
              </h2>
              {board.frozen ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  Frozen after minute {board.frozen_after_minute}
                </span>
              ) : null}
            </div>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Solved</th>
                    <th className="px-4 py-3">Points</th>
                    <th className="px-4 py-3">Penalty</th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r) => (
                    <tr key={r.team_id} className="border-t border-line">
                      <td className="px-4 py-3 tabular-nums">{r.rank}</td>
                      <td className="px-4 py-3">{r.name}</td>
                      <td className="px-4 py-3 tabular-nums">{r.solved}</td>
                      <td className="px-4 py-3 tabular-nums">{r.points}</td>
                      <td className="px-4 py-3 tabular-nums">{r.penalty}</td>
                    </tr>
                  ))}
                  {board.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted">
                        No teams yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {board.frozen ? (
              <p className="mt-2 text-xs text-muted">
                Solves in the closing minutes are hidden until the contest ends.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Your team
            </h2>
            <div className="mt-3">
              <OnyxContestTeams
                contestId={Number(id)}
                teams={contest.teams ?? []}
                inTeam={Boolean(contest.my_team)}
                teamSize={contest.team_size}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-line p-4 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted">Problems</div>
            <ul className="mt-2 space-y-1">
              {(contest.problems ?? []).map((p) => (
                <li key={p.problem_id} className="flex justify-between gap-2">
                  <Link href={'/onyx/practice/' + p.problem_id} className="hover:underline">
                    Problem {p.problem_id}
                  </Link>
                  <span className="tabular-nums text-muted">{p.points}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Solve them in Code Lab, then record the submission here.
              {contest.penalty_minutes
                ? ' Each wrong attempt on a problem you eventually solve adds '
                  + contest.penalty_minutes + ' minutes.'
                : ''}
            </p>
            {!running ? (
              <p className="mt-2 text-xs text-muted">
                {Date.parse(contest.starts_at) > now
                  ? 'This has not started yet.' : 'This has finished.'}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </OnyxShell>
  );
}
