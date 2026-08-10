'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Assignment, RubricCriterion, Submission } from '@/lib/onyx-learn';

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm '
  + 'focus:border-slate-900 focus:outline-none';

const AUTOSAVE_MS = 5_000;
const DRAFT_KEY = (id: number) => 'onyx.assignment.' + id + '.draft';

/**
 * LRN-04b / LRN-04c -- writing and handing in.
 *
 * The acceptance criterion is blunt: kill the tab mid-answer, come back, and
 * the draft is there. That needs both halves.
 *
 *   * **Server autosave**, so it survives a different machine. Debounced, and
 *     skipped when nothing changed -- a save every keystroke is a save that
 *     fails under load.
 *   * **localStorage on every keystroke**, so it survives the five seconds
 *     between saves. This is the half that actually covers "the tab died", and
 *     the newer of the two wins on return.
 */
export function OnyxSubmissionForm({ assignment, submission }: {
  assignment: Assignment;
  submission: Submission | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState(submission?.body ?? '');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lastSaved = useRef(submission?.body ?? '');
  const restored = useRef(false);

  const locked = submission
    ? submission.status !== 'draft' && !assignment.allow_resubmission
    : false;

  // A local draft newer than the server's is the tab that died. Restore it and
  // say so, rather than silently replacing what they last saw.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY(assignment.id));
      if (!raw) return;
      const local = JSON.parse(raw) as { body: string; at: number };
      const serverAt = submission?.updated_at ? Date.parse(submission.updated_at) : 0;
      if (local.body && local.at > serverAt && local.body !== (submission?.body ?? '')) {
        setBody(local.body);
        setStatus('Restored an unsaved draft from this device.');
      }
    } catch { /* a corrupt local draft is not worth failing over */ }
  }, [assignment.id, submission]);

  const saveDraft = useCallback(async (text: string) => {
    if (text === lastSaved.current) return;
    lastSaved.current = text;
    setStatus('Saving…');
    const res = await fetch('/api/proxy/onyx/assignments/' + assignment.id + '/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    });
    const payload = await res.json().catch(() => ({}));
    setStatus(payload.ok ? 'Draft saved' : (payload.message ?? 'Could not save the draft'));
  }, [assignment.id]);

  useEffect(() => {
    if (locked || (submission && submission.status !== 'draft')) return;
    const timer = setTimeout(() => { void saveDraft(body); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [body, locked, saveDraft, submission]);

  const onChange = (text: string) => {
    setBody(text);
    // Every keystroke, because this is the copy that survives a crash.
    try {
      localStorage.setItem(DRAFT_KEY(assignment.id), JSON.stringify({ body: text, at: Date.now() }));
    } catch { /* private mode, quota -- the server copy still applies */ }
  };

  if (locked) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        You have submitted this and it cannot be resubmitted.
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await fetch('/api/proxy/onyx/assignments/' + assignment.id + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!payload.ok) { setError(payload.message ?? 'Could not submit.'); return; }
          // Handed in: the local copy has done its job.
          try { localStorage.removeItem(DRAFT_KEY(assignment.id)); } catch { /* fine */ }
          setStatus('Submitted');
          router.refresh();
        });
      }}
    >
      <label className="block text-sm font-medium text-slate-700" htmlFor="answer">
        Your answer
      </label>
      <textarea
        id="answer"
        rows={14}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { void saveDraft(body); }}
        className={field + ' font-mono'}
      />
      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !body.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white
                     hover:bg-slate-800 disabled:opacity-50">
          {submission && submission.status !== 'draft' ? 'Resubmit' : 'Submit'}
        </button>
        <button type="button" onClick={() => { void saveDraft(body); }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700
                     hover:bg-slate-50">
          Save draft
        </button>
        <span aria-live="polite" className="text-xs text-slate-500">{status}</span>
      </div>
      {assignment.due_at ? (
        <p className="text-xs text-slate-500">
          Due {new Date(assignment.due_at).toLocaleString()}
          {assignment.late_policy === 'reject' ? '. Nothing is accepted after this.' : null}
          {assignment.late_policy === 'penalty'
            ? '. Late work loses ' + assignment.late_penalty_percent + '%.'
            : null}
          {assignment.late_policy === 'accept' ? '. Late work is accepted but flagged.' : null}
        </p>
      ) : null}
    </form>
  );
}

/** What a learner sees once their work has been returned, and not before. */
export function OnyxReturnedWork({ assignment, submission }: {
  assignment: Assignment; submission: Submission;
}) {
  if (!submission.returned_at) return null;
  const byId = new Map((assignment.rubric ?? []).map((c) => [c.id, c]));

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Result</div>
        <div className="text-2xl font-semibold">
          {submission.score} <span className="text-base text-slate-500">/ {assignment.total_points}</span>
        </div>
        {submission.is_late ? (
          <p className="text-xs text-amber-700">
            Submitted late
            {assignment.late_policy === 'penalty'
              ? ' — ' + assignment.late_penalty_percent + '% was deducted.'
              : '.'}
          </p>
        ) : null}
      </div>

      {submission.rubric_scores?.length ? (
        <table className="w-full text-sm">
          <tbody>
            {submission.rubric_scores.map((s) => {
              const criterion = byId.get(s.criterion_id);
              return (
                <tr key={s.criterion_id} className="border-t border-slate-100">
                  <td className="py-2">{criterion?.title ?? 'Criterion'}</td>
                  <td className="py-2 text-right tabular-nums">
                    {s.points} / {criterion?.points ?? '—'}
                  </td>
                  <td className="py-2 pl-4 text-slate-600">{s.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {submission.feedback ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Feedback</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{submission.feedback}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * LRN-04b -- marking against the rubric.
 *
 * The total is computed from the criteria as they are typed, so a marker sees
 * the number the learner will see rather than discovering it on save.
 */
export function OnyxGrader({ submission, rubric, totalPoints }: {
  submission: Submission; rubric: RubricCriterion[]; totalPoints: number;
}) {
  const router = useRouter();
  const [points, setPoints] = useState<Record<number, string>>(
    () => Object.fromEntries(rubric.map((c) => {
      const prior = submission.rubric_scores?.find((s) => s.criterion_id === c.id);
      return [c.id, prior ? String(prior.points) : ''];
    })));
  const [comments, setComments] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const [score, setScore] = useState(submission.score !== null ? String(submission.score) : '');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const running = rubric.reduce((t, c) => t + (Number(points[c.id]) || 0), 0);

  const send = (path: string, body?: unknown) => start(async () => {
    const res = await fetch('/api/proxy/onyx/submissions/' + submission.id + '/' + path, {
      method: 'POST',
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setNotice(payload.ok ? null : (payload.message ?? 'That did not work.'));
    if (payload.ok) router.refresh();
  });

  return (
    <div className="space-y-4">
      {rubric.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2">Criterion</th><th className="py-2">Points</th><th className="py-2 pl-4">Comment</th></tr>
          </thead>
          <tbody>
            {rubric.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-2">
                  <div>{c.title}</div>
                  {c.description ? <div className="text-xs text-slate-500">{c.description}</div> : null}
                </td>
                <td className="py-2">
                  <input
                    type="number" min={0} max={c.points} step="0.5"
                    aria-label={c.title + ' points, out of ' + c.points}
                    value={points[c.id] ?? ''}
                    onChange={(e) => setPoints((p) => ({ ...p, [c.id]: e.target.value }))}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <span className="ml-1 text-xs text-slate-500">/ {c.points}</span>
                </td>
                <td className="py-2 pl-4">
                  <input
                    aria-label={'Comment on ' + c.title}
                    value={comments[c.id] ?? ''}
                    onChange={(e) => setComments((m) => ({ ...m, [c.id]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td className="py-2 font-medium">Total</td>
              <td className="py-2 font-medium tabular-nums">{running} / {totalPoints}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="score">
            Score out of {totalPoints}
          </label>
          <input id="score" type="number" min={0} max={totalPoints} step="0.5"
            value={score} onChange={(e) => setScore(e.target.value)}
            className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="feedback">Feedback</label>
        <textarea id="feedback" rows={4} value={feedback}
          onChange={(e) => setFeedback(e.target.value)} className={field + ' mt-1'} />
      </div>

      {notice ? <p role="alert" className="text-sm text-rose-600">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" disabled={pending}
          onClick={() => send('grade', rubric.length
            ? {
              feedback,
              scores: rubric.map((c) => ({
                criterion_id: c.id, points: Number(points[c.id]) || 0,
                comment: comments[c.id] || null,
              })),
            }
            : { feedback, score: Number(score) })}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white
                     hover:bg-slate-800 disabled:opacity-50"
        >
          Save grade
        </button>
        <button
          type="button"
          disabled={pending || submission.status !== 'graded'}
          onClick={() => send('return')}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700
                     hover:bg-slate-50 disabled:opacity-50"
        >
          Return to learner
        </button>
        <span className="text-xs text-slate-500">
          {submission.returned_at
            ? 'Returned — the learner can see this.'
            : 'Nothing is visible to the learner until it is returned.'}
        </span>
      </div>
    </div>
  );
}
