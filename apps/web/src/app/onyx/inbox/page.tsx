import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { MarkAllRead } from '@/components/onyx-inbox';
import {
  Empty, Icon, type IconName, Pill, SectionHead,
} from '@/components/onyx-ui';

export const metadata: Metadata = { title: 'Inbox' };

interface Notification {
  id: number; kind: string; title: string; body: string | null;
  link: string | null; read_at: string | null; created_at: string;
}

interface Mention {
  id: number; discussion_id: number; title: string | null;
  read_at: string | null; created_at: string; resolved: boolean;
}

/** One icon per kind, so an inbox of thirty is scannable rather than uniform. */
const ICON: Record<string, IconName> = {
  'membership.invited': 'users',
  'employer.invited': 'briefcase',
  'guardian.linked': 'users',
  'guardian.consent_changed': 'shield',
  'ticket.assigned': 'help',
  'ticket.answered': 'help',
  'ticket.overdue': 'flag',
  'assignment.returned': 'edit',
  'results.published': 'award',
  'certificate.issued': 'award',
  'invoice.issued': 'wallet',
  'discussion.mentioned': 'help',
};

const WHEN = (iso: string) => new Date(iso).toLocaleDateString(undefined,
  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Everything this institution has told you.
 *
 * Onyx had no outbound channel at all until now, and it showed in four
 * requirements that describe somebody being told something: a new member being
 * invited, an employer being given access, a guardian link needing the
 * learner's consent, and an escalated question reaching a named owner. Each of
 * those happened in the database and nowhere else.
 *
 * Mentions are folded in rather than given their own page. `/api/onyx/mentions`
 * existed with no screen, and building it a second inbox would have meant a
 * person checking two places to find out whether anybody wanted them.
 */
export default async function OnyxInboxPage() {
  await requireOnyxSession();

  const [me, inbox, mentions] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<{ items: Notification[]; unread: number }>('/api/onyx/notifications'),
    onyxApiSafe<Mention[]>('/api/onyx/mentions'),
  ]);

  const unreadMentions = (mentions ?? []).filter((m) => !m.read_at);

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title="Inbox"
      subtitle={inbox.unread
        ? inbox.unread + (inbox.unread === 1 ? ' unread notification' : ' unread notifications')
        : 'Nothing unread.'}
      action={inbox.unread ? <MarkAllRead /> : undefined}
    >
      {unreadMentions.length ? (
        <section className="mb-7">
          <SectionHead title="You were mentioned" />
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line
                         bg-white shadow-card">
            {unreadMentions.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3.5
                                        hover:bg-brand-50/40">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl
                                 bg-brand-50 text-brand-700">
                  <Icon name="help" className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  {/* A deleted thread still shows. "Somebody named you in
                      something that is gone" is true; dropping the row would
                      be a silent hole. */}
                  {m.title ? (
                    <Link href={'/onyx/discussions/' + m.discussion_id}
                      className="block truncate text-[15px] font-semibold hover:underline">
                      {m.title}
                    </Link>
                  ) : (
                    <span className="block text-[15px] font-semibold text-muted">
                      A discussion that has since been removed
                    </span>
                  )}
                  <span className="text-[12.5px] text-muted">{WHEN(m.created_at)}</span>
                </span>
                {m.resolved ? <Pill tone="good">Resolved</Pill> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        {unreadMentions.length ? <SectionHead title="Everything else" /> : null}
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line
                       bg-white shadow-card">
          {inbox.items.map((n) => {
            const unread = !n.read_at;
            const row = (
              <>
                <span className={'grid h-10 w-10 shrink-0 place-items-center rounded-xl '
                  + (unread ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-muted')}>
                  <Icon name={ICON[n.kind] ?? 'bell'} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={'block truncate text-[15px] '
                    + (unread ? 'font-bold' : 'font-semibold text-slate-700')}>
                    {n.title}
                  </span>
                  {n.body ? (
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                      {n.body}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {WHEN(n.created_at)}
                  </span>
                </span>
                {/* Unread is carried by weight AND a dot. Weight alone is a
                    difference nobody notices in a list of one. */}
                {unread ? (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600"
                    aria-label="Unread" />
                ) : null}
              </>
            );

            return (
              <li key={n.id} className={unread ? 'bg-brand-50/30' : undefined}>
                {n.link ? (
                  <Link href={n.link}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-brand-50/50">
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5">{row}</div>
                )}
              </li>
            );
          })}
          {inbox.items.length === 0 ? (
            <li>
              <Empty icon="bell">
                Nothing yet. Anything this institution needs to tell you — an invitation,
                a returned assignment, a result, a question assigned to you — lands here.
              </Empty>
            </li>
          ) : null}
        </ul>
      </section>
    </OnyxShell>
  );
}
