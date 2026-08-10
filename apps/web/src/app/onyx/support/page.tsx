import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxSla } from '@/components/onyx-engage';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, type Me } from '@/lib/onyx-session';
import type { Ticket } from '@/lib/onyx-campus';

export const metadata: Metadata = { title: 'Support' };

const MENTOR_ROLES = ['admin', 'faculty'];

/**
 * LRN-06b -- the queue.
 *
 * A learner sees their own tickets; a mentor sees the queue, unowned first --
 * that ordering is the acceptance criterion, not a display choice, so it comes
 * straight from the service rather than being re-sorted here.
 */
export default async function OnyxSupportPage() {
  await requireOnyxSession();
  const me = await onyxApi<Me>('/api/onyx/me');
  const mentor = MENTOR_ROLES.includes(me.role);

  const tickets = await onyxApi<Ticket[]>('/api/onyx/tickets');

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={mentor ? 'Mentor queue' : 'Your tickets'}
      subtitle={mentor
        ? 'Unowned first. Every ticket has a deadline, whether or not it has an owner yet.'
        : 'Escalated questions and anything you have raised directly.'}
    >
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {tickets.map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={'/onyx/support/' + t.id} className="font-medium hover:underline">
                  {t.subject}
                </Link>
                <div className="mt-0.5 text-xs text-slate-500">
                  {t.priority} · {t.status}
                  {t.owner_name ? ' · owned by ' + t.owner_name : ' · unowned'}
                  {!mentor && t.raised_by_name ? ' · raised by ' + t.raised_by_name : ''}
                </div>
              </div>
              <OnyxSla ticket={t} />
            </div>
          </li>
        ))}
        {tickets.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-slate-500">
            {mentor ? 'The queue is empty.' : 'You have no open tickets.'}
          </li>
        ) : null}
      </ul>
    </OnyxShell>
  );
}
