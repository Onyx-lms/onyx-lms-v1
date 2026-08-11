import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxSla } from '@/components/onyx-engage';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import type { Ticket } from '@/lib/onyx-campus';
import { Empty, ListRow, Pill, RowList, SectionHead, StatTile } from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Support' };

const MENTOR_ROLES = ['admin', 'faculty'];

/** What the API returns from /tickets/breaches. */
interface Breaches { breached: Ticket[]; unowned: number }

/**
 * LRN-06b -- the queue, and what has run out of time.
 *
 * A learner sees their own tickets; a mentor sees the queue, unowned first --
 * that ordering is the acceptance criterion, not a display choice, so it comes
 * straight from the service rather than being re-sorted here.
 *
 * The requirement's words are "a support ticket path with SLA visibility for
 * unresolved questions", and the breach list was the half with no screen: the
 * API could say which tickets had run past their deadline and nothing asked it,
 * so the one thing an SLA is for -- being seen to have been missed -- was
 * invisible. It goes above the queue, because a mentor who has to scroll to
 * find the overdue work is a mentor who finds it late.
 */
export default async function OnyxSupportPage() {
  await requireOnyxSession();
  const me = await onyxApi<Me>('/api/onyx/me');
  const mentor = MENTOR_ROLES.includes(me.role);

  const [tickets, breaches] = await Promise.all([
    onyxApi<Ticket[]>('/api/onyx/tickets'),
    // Staff only, and the API says so -- absent rather than fatal for a learner.
    mentor ? onyxApiSafe<Breaches>('/api/onyx/tickets/breaches') : null,
  ]);

  const overdue = breaches?.breached ?? [];
  const open = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed');

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={mentor ? 'Mentor queue' : 'Your tickets'}
      subtitle={mentor
        ? 'Unowned first. Every ticket has a deadline, whether or not it has an owner yet.'
        : 'Escalated questions and anything you have raised directly.'}
    >
      {mentor ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatTile label="Open" value={open.length} note="not yet resolved" />
          <StatTile label="Past their deadline" value={overdue.length}
            note={overdue.length ? 'needs an answer now' : 'nothing overdue'} />
          <StatTile label="Nobody owns" value={breaches?.unowned ?? 0}
            note="of the overdue ones" />
        </div>
      ) : null}

      {mentor && overdue.length ? (
        <section className="mb-7">
          <SectionHead title="Past their deadline" />
          <div className="mb-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm
                          text-red-900">
            {overdue.length === 1
              ? 'One question has run past the time it was promised in.'
              : overdue.length + ' questions have run past the time they were promised in.'}
            {' '}An unowned one has nobody to chase, so claim it before answering it.
          </div>
          <RowList label="Tickets past their deadline">
            {overdue.map((t) => (
              <ListRow
                key={t.id}
                icon="flag"
                tone="late"
                title={t.subject}
                href={'/onyx/support/' + t.id}
                chips={
                  <>
                    <Pill tone="late">Overdue</Pill>
                    {t.owner_name ? null : <Pill tone="soon">Unowned</Pill>}
                  </>
                }
                meta={
                  t.priority + ' · ' + t.status
                  + (t.owner_name ? ' · ' + t.owner_name : ' · nobody has claimed it')
                  + (t.raised_by_name ? ' · raised by ' + t.raised_by_name : '')
                }
                trailing={<OnyxSla ticket={t} />}
                action={{ href: '/onyx/support/' + t.id, label: 'Answer' }}
              />
            ))}
          </RowList>
        </section>
      ) : null}

      <section>
        {mentor ? <SectionHead title="The queue" /> : null}
        <RowList label={mentor ? 'The mentor queue' : 'Your tickets'}>
          {tickets.map((t) => (
            <ListRow
              key={t.id}
              icon={t.status === 'resolved' ? 'check' : 'help'}
              tone={t.status === 'resolved' ? 'good' : t.owner_name ? 'brand' : 'neutral'}
              title={t.subject}
              href={'/onyx/support/' + t.id}
              chips={t.owner_name ? null : mentor ? <Pill tone="soon">Unowned</Pill> : null}
              meta={
                t.priority + ' · ' + t.status
                + (t.owner_name ? ' · owned by ' + t.owner_name : ' · unowned')
                + (!mentor && t.raised_by_name ? ' · raised by ' + t.raised_by_name : '')
              }
              trailing={<OnyxSla ticket={t} />}
            />
          ))}
          {tickets.length === 0 ? (
            <li>
              <Empty icon="help">
                {mentor
                  ? 'The queue is empty. Escalated questions and tickets raised directly land here.'
                  : 'You have no open tickets. Asking on a course and escalating creates one.'}
              </Empty>
            </li>
          ) : null}
        </RowList>
      </section>
    </OnyxShell>
  );
}
