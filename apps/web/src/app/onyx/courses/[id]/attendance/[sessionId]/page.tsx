import Link from 'next/link';
import type { Metadata } from 'next';
import { OnyxShell } from '@/components/onyx-shell';
import { OnyxCheckIn, OnyxRosterMarking, OnyxSessionCode } from '@/components/onyx-attendance';
import { navFor } from '@/lib/onyx-nav';
import { requireOnyxSession, onyxApi, onyxApiSafe, type Me } from '@/lib/onyx-session';
import { isStaff, type AttendanceRecord, type AttendanceSession } from '@/lib/onyx-learn';

export const metadata: Metadata = { title: 'Session' };

interface RosterResponse {
  session: AttendanceSession;
  roster: { user_id: number; record: AttendanceRecord | null }[];
}

/**
 * LRN-03 -- one session, from both sides.
 *
 * Faculty get the rotating code and the roster; a learner gets a box to type
 * the code into. Which one is rendered follows from the role, and the API
 * refuses the other half regardless.
 */
export default async function OnyxSessionPage(
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const claims = await requireOnyxSession();
  const { id, sessionId } = await params;
  const staff = isStaff(claims.tenant_role);

  const [me, sessions, rosterData, members] = await Promise.all([
    onyxApi<Me>('/api/onyx/me'),
    onyxApi<AttendanceSession[]>('/api/onyx/courses/' + id + '/attendance'),
    staff ? onyxApiSafe<RosterResponse>('/api/onyx/attendance/' + sessionId + '/roster') : null,
    staff ? onyxApiSafe<{ user_id: number; user: { name: string; email: string } | null }[]>(
      '/api/onyx/members') : null,
  ]);

  const session = sessions.find((s) => String(s.id) === sessionId);
  if (!session) {
    return (
      <OnyxShell me={me} nav={navFor(me.role)} title="Session">
        <p className="text-sm text-muted">That session is not part of this course.</p>
      </OnyxShell>
    );
  }

  const names = new Map((members ?? []).map((m) => [Number(m.user_id), m.user]));
  const roster = (rosterData?.roster ?? []).map((r) => ({
    user_id: r.user_id,
    name: names.get(r.user_id)?.name ?? ('User ' + r.user_id),
    email: names.get(r.user_id)?.email ?? '',
    record: r.record,
  }));

  return (
    <OnyxShell
      me={me}
      nav={navFor(me.role)}
      title={session.title}
      subtitle={new Date(session.scheduled_at).toLocaleString()}
    >
      <Link href={'/onyx/courses/' + id} className="text-sm text-muted hover:underline">
        &larr; Back to the course
      </Link>

      <div className="mt-6 space-y-8">
        {staff ? (
          <>
            {session.status === 'open' ? (
              <div className="max-w-sm"><OnyxSessionCode sessionId={session.id} /></div>
            ) : null}
            <OnyxRosterMarking session={session} roster={roster} />
          </>
        ) : (
          <div className="space-y-3">
            {session.status === 'open' ? (
              <>
                <p className="text-sm text-muted">
                  Enter the code on screen. It changes every {session.qr_window_seconds} seconds.
                </p>
                <OnyxCheckIn sessionId={session.id} />
              </>
            ) : (
              <p className="text-sm text-muted">This session is closed.</p>
            )}
          </div>
        )}
      </div>
    </OnyxShell>
  );
}
