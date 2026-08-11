import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxPageRole, onyxApi, type Me } from '@/lib/onyx-session';
import {
  ActionLink, Card, CardGrid, DataTable, EmptyRow, Icon, Meter, Pill, Score,
  SectionHead, State, StatTile,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Invigilate' };

interface QueueRow {
  attempt_id: number; assessment_id: number; user_id: number; status: string;
  integrity_flags: number; integrity_status: string; open_events: number;
}

/**
 * A live dot that stops moving when the reader has asked for that.
 *
 * `State` paints the dot with `animate-pulse`; a pulsing red mark is exactly
 * the sort of thing `prefers-reduced-motion` exists for, and the word beside
 * it carries the state on its own once the animation is gone.
 */
const CALM = '[&_i]:motion-reduce:animate-none';

/**
 * How loud one attempt's flag score is.
 *
 * `REVIEW_THRESHOLD` in the proctor service is 5, so five is the line at which
 * the product itself already says "a human should look at this". The word is
 * always shown beside the band: severity here decides whether somebody walks
 * into a hall, and about one man in twelve reads the red and the amber alike.
 */
function severity(flags: number): {
  label: string; tone: 'late' | 'soon' | 'neutral'; band: 'lo' | 'mid' | 'none';
} {
  if (flags >= 5) return { label: 'High', tone: 'late', band: 'lo' };
  if (flags >= 2) return { label: 'Medium', tone: 'soon', band: 'mid' };
  return { label: 'Low', tone: 'neutral', band: 'none' };
}

/** Where an attempt's integrity case has got to, as a dot and a word. */
function caseState(status: string): { tone: 'on' | 'off' | 'idle'; label: string } {
  if (status === 'cleared') return { tone: 'on', label: 'Cleared' };
  if (status === 'upheld') return { tone: 'off', label: 'Upheld' };
  if (status === 'review') return { tone: 'off', label: 'Awaiting review' };
  return { tone: 'idle', label: 'Clean' };
}

/** ASS-02b -- everything an invigilator has to look at, worst first. */
export default async function OnyxInvigilatePage() {
  await requireOnyxPageRole('admin', 'faculty', 'exams');
  const [me, queue] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<QueueRow[]>('/api/onyx/proctor/queue'),
  ]);

  // Everything below is read off the queue the API already returned. A sitting
  // is an assessment with flagged attempts on it; the invigilation console is
  // the only place that grouping is worth anything.
  const running = queue.filter((r) => r.status === 'in_progress');
  const openEvents = queue.reduce((n, r) => n + r.open_events, 0);
  const awaiting = queue.filter((r) => r.open_events > 0).length;
  const decided = queue.filter((r) => r.integrity_status === 'cleared'
    || r.integrity_status === 'upheld').length;

  const sittings = [...queue.reduce((map, r) => {
    const s = map.get(r.assessment_id) ?? {
      assessment_id: r.assessment_id, attempts: 0, live: 0, open: 0, worst: 0, settled: 0,
    };
    s.attempts += 1;
    if (r.status === 'in_progress') s.live += 1;
    s.open += r.open_events;
    s.worst = Math.max(s.worst, r.integrity_flags);
    if (r.open_events === 0) s.settled += 1;
    map.set(r.assessment_id, s);
    return map;
  }, new Map<number, {
    assessment_id: number; attempts: number; live: number;
    open: number; worst: number; settled: number;
  }>()).values()].sort((a, b) => b.open - a.open || b.worst - a.worst);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Invigilation"
      // A flag is what a browser noticed, not proof of anything, and a console
      // that implies otherwise is how proctoring earns its bad name.
      subtitle="A flag is evidence, not a verdict. Nothing here fails anybody on its own."
    >
      {/* The live bar is the whole reason this screen exists, so it is the first
          thing under the title: everything below is historical the moment an
          attempt is handed in. */}
      <Card className={'mb-5 p-4 ' + (running.length > 0 ? 'border-red-200' : '')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className={CALM}>
            {running.length > 0 ? (
              <State tone="live">
                {running.length === 1 ? '1 attempt running' : running.length + ' attempts running'}
              </State>
            ) : (
              <State tone="idle">No attempt is running</State>
            )}
          </span>
          <span className="text-[13px] text-muted">
            <span className="tabular-nums">{queue.length}</span> flagged
            {' · '}
            <span className="tabular-nums">{openEvents}</span>
            {openEvents === 1 ? ' event awaiting review' : ' events awaiting review'}
          </span>
        </div>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Flagged attempts" value={queue.length}
          note={queue.length === 0 ? 'nothing has tripped a rule' : 'worst first below'} />
        <StatTile label="Awaiting review" value={awaiting}
          note={openEvents + (openEvents === 1 ? ' open event' : ' open events')} />
        <StatTile label="Running now" value={running.length} note="papers still in progress" />
        <StatTile label="Decided" value={decided} note="cleared or upheld by a person" />
      </div>

      {sittings.length > 1 ? (
        <section className="mb-7">
          <SectionHead title="Sittings with flags"
            action={{ href: '/onyx/assessments', label: 'All assessments' }} />
          <CardGrid min="15rem">
            {sittings.map((s) => {
              const worst = severity(s.worst);
              return (
                <Card key={s.assessment_id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Pill tone={worst.tone}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="flag" className="h-3.5 w-3.5" />
                        {worst.label}
                      </span>
                    </Pill>
                    <span className={'text-[13px] ' + CALM}>
                      {s.live > 0
                        ? <State tone="live">{s.live} running</State>
                        : <State tone="idle">Finished</State>}
                    </span>
                  </div>

                  <div className="mt-2 text-[15px] font-semibold">
                    Assessment #{s.assessment_id}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {s.attempts === 1 ? '1 flagged attempt' : s.attempts + ' flagged attempts'}
                    {' · '}
                    <span className="tabular-nums">{s.open}</span> still open
                  </div>

                  <div className="mt-3">
                    <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                      <span className="font-semibold">Decided</span>
                      <span className="tabular-nums text-muted">
                        {s.settled} of {s.attempts}
                      </span>
                    </div>
                    <Meter percent={(s.settled / s.attempts) * 100}
                      label={'Attempts decided on assessment ' + s.assessment_id} />
                  </div>

                  <div className="mt-3.5">
                    <ActionLink href={'/onyx/assessments/' + s.assessment_id} label="Open" />
                  </div>
                </Card>
              );
            })}
          </CardGrid>
        </section>
      ) : null}

      <section>
        <SectionHead title="Review queue" />
        {/* tabIndex makes the horizontal scroll reachable by keyboard: a region
            that only scrolls with a wheel strands anyone on a keyboard at
            whatever columns happen to fit. */}
        <div tabIndex={0} role="region" aria-label="Attempts awaiting review">
          <DataTable
            caption="Attempts with integrity flags, worst first"
            head={
              <>
                <th scope="col">Attempt</th>
                <th scope="col">Severity</th>
                <th scope="col">Flag score</th>
                <th scope="col">Still open</th>
                <th scope="col">Case</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </>
            }
          >
            {queue.map((r) => {
              const sev = severity(r.integrity_flags);
              const state = caseState(r.integrity_status);
              return (
                <tr key={r.attempt_id} className="align-middle">
                  <td>
                    <div className="font-semibold">Attempt {r.attempt_id}</div>
                    <div className="text-[12.5px] text-muted">
                      Candidate #{r.user_id} · assessment #{r.assessment_id}
                    </div>
                  </td>
                  <td>
                    <Pill tone={sev.tone}>
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="flag" className="h-3.5 w-3.5" />
                        {sev.label}
                      </span>
                    </Pill>
                  </td>
                  <td><Score value={r.integrity_flags} band={sev.band} /></td>
                  <td className="tabular-nums">{r.open_events}</td>
                  <td><State tone={state.tone}>{state.label}</State></td>
                  <td className="text-right">
                    <ActionLink href={'/onyx/attempts/' + r.attempt_id + '/integrity'}
                      label="Review" />
                  </td>
                </tr>
              );
            })}
            {queue.length === 0 ? (
              <EmptyRow colSpan={6} icon="shield">
                Nothing to review. Attempts appear here the moment a monitored event is
                recorded against one — a tab switch, a paste, a camera that stops.
              </EmptyRow>
            ) : null}
          </DataTable>
        </div>
      </section>
    </OnyxShell>
  );
}
