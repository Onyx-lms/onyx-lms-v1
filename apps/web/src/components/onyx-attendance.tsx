'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AttendanceRecord, AttendanceSession } from '@/lib/onyx-learn';

const STATUSES = ['present', 'late', 'absent', 'excused'] as const;

const field = 'rounded-lg border border-slate-300 px-2 py-1 text-sm '
  + 'focus:border-slate-900 focus:outline-none';

/**
 * LRN-03b -- the rotating code, shown to the room.
 *
 * It refreshes itself a moment before the current one expires, so the code on
 * screen is always the one the server will accept. A countdown is shown for the
 * same reason: a learner who can see the code is about to change knows to scan
 * now rather than photograph it.
 */
export function OnyxSessionCode({ sessionId }: { sessionId: number }) {
  const [code, setCode] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const pull = async () => {
      const res = await fetch('/api/proxy/onyx/attendance/' + sessionId + '/code');
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!body.ok) { setError(body.message ?? 'No code available.'); return; }
      setError(null);
      setCode(body.data.code);
      setSeconds(body.data.expires_in_seconds);
      // Half a second early: a code fetched exactly on the boundary is already
      // the wrong one by the time it is on screen.
      timer = setTimeout(pull, Math.max(1000, body.data.expires_in_seconds * 1000 - 500));
    };
    void pull();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(tick);
  }, [code]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;

  return (
    <div className="rounded-2xl border border-line p-6 text-center">
      <div className="text-xs uppercase tracking-wide text-muted">Check-in code</div>
      <div className="mt-2 font-mono text-5xl font-semibold tracking-[0.2em]">
        {code ?? '········'}
      </div>
      <div className="mt-2 text-xs text-muted">
        Changes in {seconds}s. Only the code on screen right now will be accepted.
      </div>
    </div>
  );
}

/** The learner's side: type or scan the code. No user id is sent. */
export function OnyxCheckIn({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setNotice(null);
        start(async () => {
          const res = await fetch('/api/proxy/onyx/attendance/' + sessionId + '/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: String(data.get('code') ?? '').toUpperCase() }),
          });
          const body = await res.json().catch(() => ({}));
          setNotice(body.ok
            ? { tone: 'ok', text: 'You are marked present.' }
            : { tone: 'bad', text: body.message ?? 'That did not work.' });
          if (body.ok) router.refresh();
        });
      }}
    >
      <input
        name="code" required maxLength={8} autoComplete="off"
        placeholder="Code on screen" aria-label="Check-in code"
        className={field + ' w-40 font-mono uppercase tracking-widest'}
      />
      <button type="submit" disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white
                   hover:bg-brand-700 disabled:opacity-50">
        {pending ? 'Checking in…' : 'Check in'}
      </button>
      {notice ? (
        <span className={'text-sm ' + (notice.tone === 'ok' ? 'text-emerald-700' : 'text-rose-600')}>
          {notice.text}
        </span>
      ) : null}
    </form>
  );
}

/** LRN-03a -- faculty walking the roster. */
export function OnyxRosterMarking({ session, roster }: {
  session: AttendanceSession;
  roster: { user_id: number; name: string; email: string; record: AttendanceRecord | null }[];
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<number, string>>(
    () => Object.fromEntries(roster.map((r) => [r.user_id, r.record?.status ?? 'present'])));
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setMarks(Object.fromEntries(roster.map((r) => [r.user_id, s])))}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs capitalize
                       text-slate-700 hover:bg-slate-50"
          >
            All {s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Learner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">How</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.user_id} className="border-t border-line">
                <td className="px-4 py-2">
                  <div>{r.name}</div>
                  <div className="text-xs text-muted">{r.email}</div>
                </td>
                <td className="px-4 py-2">
                  <select
                    aria-label={'Attendance for ' + r.name}
                    value={marks[r.user_id] ?? 'present'}
                    onChange={(e) => setMarks((m) => ({ ...m, [r.user_id]: e.target.value }))}
                    className={field}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-xs text-muted">
                  {r.record
                    ? (r.record.method === 'qr' ? 'Checked in' : 'Marked')
                    : 'Not yet marked'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || session.status !== 'open' || roster.length === 0}
          onClick={() => start(async () => {
            const res = await fetch('/api/proxy/onyx/attendance/' + session.id + '/mark', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entries: roster.map((r) => ({
                  user_id: r.user_id, status: marks[r.user_id] ?? 'present',
                })),
              }),
            });
            const body = await res.json().catch(() => ({}));
            setNotice(body.ok ? 'Attendance recorded.' : (body.message ?? 'That did not work.'));
            if (body.ok) router.refresh();
          })}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                     hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save attendance'}
        </button>
        {session.status !== 'open'
          ? <span className="text-sm text-muted">This session is closed.</span>
          : null}
        {notice ? <span className="text-sm text-muted">{notice}</span> : null}
      </div>
    </div>
  );
}

/**
 * LRN-03c -- the shortfall threshold.
 *
 * A number rather than a policy switch, because the number is not ours: a
 * university with a 75% rule and one with an 85% rule are both looking at the
 * same records. It lives in the query string so a registrar can send somebody
 * the exact report they are reading, and so a reload does not lose it.
 */
export function ThresholdForm({ courseId, threshold }: {
  courseId: number; threshold: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(threshold));

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 100) return;
        router.push('/onyx/courses/' + courseId + '/attendance?threshold=' + n);
      }}
    >
      <div>
        <label htmlFor="threshold" className="block text-xs font-medium text-muted">
          Shortfall below
        </label>
        <input
          id="threshold" name="threshold" type="number" min={0} max={100} step={1}
          value={value} onChange={(e) => setValue(e.target.value)}
          className={field + ' mt-1 w-24 tabular-nums'}
        />
      </div>
      <button
        type="submit"
        className="min-h-[34px] rounded-2xl border border-line px-3 text-sm font-medium
                   text-slate-700 hover:bg-brand-50"
      >
        Apply
      </button>
      <p className="text-xs text-muted">
        Percent attendance a learner must reach before they are flagged.
      </p>
    </form>
  );
}
