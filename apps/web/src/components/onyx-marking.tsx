'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EVENT_LABELS, type MarkerPaper, type ProctorTimeline } from '@/lib/onyx-assess';

/**
 * ASS-03 -- marking one paper.
 *
 * Objective questions arrive already scored and are shown, not editable: they
 * were marked against the answer key as it stood when the paper was sat, and
 * letting a marker nudge them would make "reproducible marks" untrue.
 *
 * The candidate's name is absent when the assessment is anonymous. It is absent
 * from the payload, not hidden by CSS -- there is nothing here to reveal.
 */
export function OnyxMarker({ paper }: { paper: MarkerPaper }) {
  const router = useRouter();
  const subjective = paper.questions.filter((q) => !q.objective);
  const [marks, setMarks] = useState<Record<number, string>>(
    () => Object.fromEntries(subjective.map((q) =>
      [q.question_id, q.manual_points !== null ? String(q.manual_points) : ''])));
  const [comments, setComments] = useState<Record<number, string>>(
    () => Object.fromEntries(subjective.map((q) => [q.question_id, q.marker_comment ?? ''])));
  const [role, setRole] = useState<'first' | 'second' | 'moderation'>('first');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const auto = paper.questions
    .filter((q) => q.objective)
    .reduce((t, q) => t + Number(q.auto_points ?? 0), 0);
  const manual = subjective.reduce((t, q) => t + (Number(marks[q.question_id]) || 0), 0);
  const done = new Set(paper.grades.map((g) => g.role));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-3 text-sm">
        <span>
          <span className="text-xs uppercase tracking-wide text-muted">Auto</span>
          <span className="ml-2 tabular-nums">{auto}</span>
        </span>
        <span>
          <span className="text-xs uppercase tracking-wide text-muted">By hand</span>
          <span className="ml-2 tabular-nums">{manual}</span>
        </span>
        <span className="font-medium">
          <span className="text-xs uppercase tracking-wide text-muted">Total</span>
          <span className="ml-2 tabular-nums">{auto + manual} / {paper.max_score}</span>
        </span>
        {paper.integrity_flags > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            {paper.integrity_flags} integrity points
          </span>
        ) : null}
        {paper.anonymous ? (
          <span className="ml-auto text-xs text-muted">Marking anonymously</span>
        ) : null}
      </div>

      <ol className="space-y-4">
        {paper.questions.map((q, i) => (
          <li key={q.question_id} className="rounded-2xl border border-line p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-muted">
                Question {i + 1} · v{q.version}
              </span>
              <span className="text-xs text-muted">{q.points} marks</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{q.prompt}</p>

            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-muted">Answer given</div>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {formatResponse(q.response, q.options) || <span className="text-muted">Nothing</span>}
              </p>
            </div>

            {q.objective ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className={Number(q.auto_points) >= q.points ? 'text-emerald-700' : 'text-rose-700'}>
                  {Number(q.auto_points ?? 0)} / {q.points}
                </span>
                <span className="text-xs text-muted">
                  Expected: {formatResponse(q.expected, q.options)}
                </span>
                {/* Scored against the key as it stood when the paper was sat.
                    Editing it here would make marks irreproducible. */}
                <span className="text-xs text-muted">scored automatically</span>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr]">
                <label className="text-sm">
                  <span className="sr-only">Marks for question {i + 1}</span>
                  <input
                    type="number" min={0} max={q.points} step="0.5"
                    aria-label={'Marks out of ' + q.points}
                    value={marks[q.question_id] ?? ''}
                    onChange={(e) => setMarks((m) => ({ ...m, [q.question_id]: e.target.value }))}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <span className="ml-1 text-xs text-muted">/ {q.points}</span>
                </label>
                <input
                  aria-label={'Comment on question ' + (i + 1)}
                  placeholder="Comment for the candidate"
                  value={comments[q.question_id] ?? ''}
                  onChange={(e) => setComments((c) => ({ ...c, [q.question_id]: e.target.value }))}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
            )}
          </li>
        ))}
      </ol>

      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="sr-only">Marking as</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="first">First marker</option>
            <option value="second">Second marker</option>
            <option value="moderation">Moderator</option>
          </select>
        </label>
        <button
          type="button"
          disabled={pending || subjective.length === 0}
          onClick={() => start(async () => {
            setError(null); setNotice(null);
            const res = await fetch('/api/proxy/onyx/attempts/' + paper.id + '/mark', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role,
                marks: subjective.map((q) => ({
                  question_id: q.question_id,
                  points: Number(marks[q.question_id]) || 0,
                  comment: comments[q.question_id] || null,
                })),
              }),
            });
            const body = await res.json().catch(() => ({}));
            if (!body.ok) { setError(body.message ?? 'Could not save.'); return; }
            setNotice('Saved as ' + role + ' marker.');
            router.refresh();
          })}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                     hover:bg-brand-700 disabled:opacity-50"
        >
          Save marks
        </button>
        <span className="text-xs text-muted">
          {subjective.length === 0
            ? 'Everything on this paper was scored automatically.'
            : 'Marked so far: ' + ([...done].join(', ') || 'nobody')}
        </span>
      </div>
    </div>
  );
}

/** ASS-02b -- the integrity timeline an invigilator reads. */
export function OnyxIntegrityTimeline({ timeline }: { timeline: ProctorTimeline }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decide = (path: string, body: unknown) => start(async () => {
    setError(null);
    const res = await fetch('/api/proxy/onyx/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!payload.ok) { setError(payload.message ?? 'That did not work.'); return; }
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-3 text-sm">
        <span>
          <span className="text-xs uppercase tracking-wide text-muted">Integrity score</span>
          <span className="ml-2 tabular-nums">{timeline.integrity_flags}</span>
        </span>
        <span className="capitalize">{timeline.integrity_status}</span>
        <span className="text-xs text-muted">
          {timeline.consented_at
            ? 'Consented ' + new Date(timeline.consented_at).toLocaleString()
            : 'No consent recorded'}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={pending}
            onClick={() => decide('attempts/' + timeline.attempt_id + '/integrity',
              { decision: 'cleared' })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs
                       hover:bg-slate-50 disabled:opacity-50">
            Clear this attempt
          </button>
          <button type="button" disabled={pending}
            onClick={() => decide('attempts/' + timeline.attempt_id + '/integrity',
              { decision: 'upheld' })}
            className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs text-rose-700
                       hover:bg-rose-50 disabled:opacity-50">
            Uphold concerns
          </button>
        </div>
      </div>

      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}

      <ol className="divide-y divide-line rounded-2xl border border-line">
        {timeline.events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted">
              +{Math.floor(e.offset_seconds / 60)}m{e.offset_seconds % 60}s
            </span>
            <span className="flex-1">{EVENT_LABELS[e.kind] ?? e.kind}</span>
            {e.weight > 0 ? (
              <span className="text-xs text-muted">weight {e.weight}</span>
            ) : null}
            {/* A client clock well out of step is itself a signal. */}
            {e.clock_skew_seconds !== null && Math.abs(e.clock_skew_seconds) > 60 ? (
              <span className="text-xs text-amber-700">
                clock off by {e.clock_skew_seconds}s
              </span>
            ) : null}
            {e.weight > 0 ? (
              e.review === 'open' ? (
                <span className="flex gap-2">
                  <button type="button" disabled={pending}
                    onClick={() => decide('proctor/events/' + e.id + '/review',
                      { decision: 'dismissed' })}
                    className="text-xs text-muted hover:underline disabled:opacity-50">
                    dismiss
                  </button>
                  <button type="button" disabled={pending}
                    onClick={() => decide('proctor/events/' + e.id + '/review',
                      { decision: 'upheld' })}
                    className="text-xs text-rose-600 hover:underline disabled:opacity-50">
                    uphold
                  </button>
                </span>
              ) : <span className="text-xs capitalize text-muted">{e.review}</span>
            ) : null}
          </li>
        ))}
        {timeline.events.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted">
            Nothing was recorded for this attempt.
          </li>
        ) : null}
      </ol>
    </div>
  );
}

/** ASS-03b -- releasing results, with what it will do said out loud. */
export function OnyxPublishResults({ assessmentId, published, moderationRequired }: {
  assessmentId: number; published: boolean; moderationRequired: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (published) {
    return <p className="text-sm text-muted">Results are published and cannot be re-marked.</p>;
  }

  return (
    <div className="space-y-2">
      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const sure = window.confirm(
            'Publish results to every candidate? Marking closes and this cannot be undone.');
          if (!sure) return;
          start(async () => {
            setError(null);
            const res = await fetch(
              '/api/proxy/onyx/assessments/' + assessmentId + '/results/publish',
              { method: 'POST' });
            const body = await res.json().catch(() => ({}));
            if (!body.ok) { setError(body.message ?? 'Could not publish.'); return; }
            router.refresh();
          });
        }}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                   hover:bg-brand-700 disabled:opacity-50"
      >
        Publish results
      </button>
      <p className="text-xs text-muted">
        Nothing is visible to candidates until this.
        {moderationRequired ? ' Every paper has to be moderated first.' : ''}
      </p>
    </div>
  );
}

/** Turns a stored response into something a marker can read. */
function formatResponse(value: unknown, options: { id: string; text: string }[]): string {
  if (value === null || value === undefined || value === '') return '';
  const label = (id: string) => options.find((o) => o.id === id)?.text ?? id;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(', ');
  if (typeof value === 'string' && options.some((o) => o.id === value)) return label(value);
  return String(value);
}
