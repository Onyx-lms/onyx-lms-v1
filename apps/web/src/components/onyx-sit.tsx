'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatClock, type Assessment, type CandidateAttempt, type PaperQuestion,
} from '@/lib/onyx-assess';

/**
 * ASS-01b/c + ASS-02a -- sitting a paper.
 *
 * The timer counts down locally so it does not need a request per second, but
 * it is **corrected from the server on every save**. A candidate who winds the
 * system clock back sees the same number as before, and the server refuses the
 * save the moment its own clock says time is up -- the display is a
 * convenience, never the authority.
 *
 * Proctoring is observed here because only the browser can see a tab lose
 * focus. Every observation is posted to the server, which timestamps it; the
 * client's own time is sent alongside rather than instead, so a divergence is
 * itself visible to an invigilator.
 */
const SAVE_DEBOUNCE_MS = 800;
const RESYNC_EVERY_MS = 30_000;

export function OnyxSitPaper({ assessment, attempt }: {
  assessment: Assessment;
  attempt: CandidateAttempt;
}) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<number, unknown>>(
    () => Object.fromEntries(attempt.questions.map((q) => [q.question_id, q.response])));
  const [remaining, setRemaining] = useState(attempt.seconds_remaining);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const submitting = useRef(false);

  // ---- the clock ----

  const submit = useCallback((automatic = false) => {
    if (submitting.current) return;
    submitting.current = true;
    start(async () => {
      const res = await fetch('/api/proxy/onyx/attempts/' + attempt.id + '/submit',
        { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!body.ok && !automatic) {
        submitting.current = false;
        setError(body.message ?? 'Could not hand that in.');
        return;
      }
      router.push('/onyx/assessments/' + assessment.id);
      router.refresh();
    });
  }, [assessment.id, attempt.id, router]);

  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          // Hand in rather than sit on a finished paper: the answers are
          // already saved, so this only closes it tidily. The server would
          // expire it anyway.
          submit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [submit]);

  // A local countdown drifts, and a wound-back clock would drift on purpose.
  useEffect(() => {
    const resync = setInterval(async () => {
      const res = await fetch('/api/proxy/onyx/attempts/' + attempt.id);
      const body = await res.json().catch(() => ({}));
      if (body.ok) setRemaining(body.data.seconds_remaining);
    }, RESYNC_EVERY_MS);
    return () => clearInterval(resync);
  }, [attempt.id]);

  // ---- autosave ----

  const save = useCallback((questionId: number, response: unknown) => {
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(async () => {
      const res = await fetch('/api/proxy/onyx/attempts/' + attempt.id + '/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, response }),
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) { setError(body.message ?? 'That answer did not save.'); return; }
      setError(null);
      setSaved((s) => ({ ...s, [questionId]: 'Saved' }));
      // The authoritative clock, corrected on every save.
      if (typeof body.data?.seconds_remaining === 'number') {
        setRemaining(body.data.seconds_remaining);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [attempt.id]);

  const answer = (questionId: number, response: unknown) => {
    setResponses((r) => ({ ...r, [questionId]: response }));
    setSaved((s) => ({ ...s, [questionId]: 'Saving…' }));
    save(questionId, response);
  };

  // ---- ASS-02a: what only the browser can see ----

  useEffect(() => {
    if (!assessment.proctoring) return;
    const send = (kind: string, detail?: unknown) => {
      void fetch('/api/proxy/onyx/attempts/' + attempt.id + '/proctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, detail, client_at: new Date().toISOString() }),
      });
    };
    const onVisibility = () => send(document.visibilityState === 'hidden' ? 'tab_blur' : 'tab_focus');
    const onBlur = () => send('tab_blur');
    const onPaste = (e: ClipboardEvent) =>
      send('paste', { length: e.clipboardData?.getData('text')?.length ?? 0 });
    const onCopy = () => send('copy');
    const onFullscreen = () => { if (!document.fullscreenElement) send('fullscreen_exit'); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('paste', onPaste);
    document.addEventListener('copy', onCopy);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [assessment.proctoring, attempt.id]);

  const answered = attempt.questions.filter((q) => {
    const r = responses[q.question_id];
    return r !== null && r !== undefined && r !== '' && !(Array.isArray(r) && !r.length);
  }).length;
  const low = remaining <= 300;

  return (
    <div className="space-y-6">
      <div className={'sticky top-0 z-10 flex flex-wrap items-center gap-4 rounded-xl border p-3 '
        + (low ? 'border-rose-300 bg-rose-50' : 'border-line bg-white')}>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted" id="time-remaining">
            Time remaining
          </div>
          {/*
            Announced politely, and only when it matters. A timer that spoke
            every second would make the paper unusable with a screen reader, so
            the live region turns on for the last five minutes.
          */}
          <div
            className={'font-mono text-2xl tabular-nums ' + (low ? 'text-rose-700' : '')}
            aria-labelledby="time-remaining"
            aria-live={low ? 'polite' : 'off'}
            aria-atomic="true"
          >
            {formatClock(remaining)}
          </div>
        </div>
        <div className="text-sm text-muted">
          {answered} of {attempt.questions.length} answered
        </div>
        {assessment.proctoring ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            Monitored
          </span>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm('Hand in now? You cannot change your answers afterwards.')) {
              submit();
            }
          }}
          className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                     hover:bg-brand-700 disabled:opacity-50"
        >
          Hand in
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <ol className="space-y-6">
        {attempt.questions.map((q, i) => (
          <li key={q.question_id} className="rounded-2xl border border-line p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-muted">
                Question {i + 1}
              </span>
              <span className="text-xs text-muted">
                {q.points} mark{q.points === 1 ? '' : 's'}
                {saved[q.question_id]
                  ? <span className="ml-2 text-muted">{saved[q.question_id]}</span>
                  : null}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{q.prompt}</p>
            <div className="mt-3">
              <QuestionInput
                question={q}
                value={responses[q.question_id]}
                onChange={(v) => answer(q.question_id, v)}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function QuestionInput({ question, value, onChange }: {
  question: PaperQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm '
    + 'focus:border-slate-900 focus:outline-none';

  if (question.type === 'single' || question.type === 'truefalse') {
    const options = question.type === 'truefalse'
      ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }]
      : question.options;
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">{question.prompt}</legend>
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={'q' + question.question_id}
              value={o.id}
              checked={String(value ?? '') === o.id}
              onChange={() => onChange(o.id)}
            />
            {o.text}
          </label>
        ))}
      </fieldset>
    );
  }

  if (question.type === 'multiple') {
    const chosen = new Set((Array.isArray(value) ? value : []).map(String));
    return (
      <fieldset className="space-y-2">
        <legend className="sr-only">{question.prompt}</legend>
        {question.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.has(o.id)}
              onChange={() => {
                const next = new Set(chosen);
                if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                onChange([...next]);
              }}
            />
            {o.text}
          </label>
        ))}
        <p className="text-xs text-muted">
          Select every correct option. Partial credit is not given.
        </p>
      </fieldset>
    );
  }

  if (question.type === 'short') {
    return (
      <input
        aria-label={question.prompt}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      />
    );
  }

  return (
    <textarea
      aria-label={question.prompt}
      rows={8}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className={field}
    />
  );
}

/** ASS-02 -- consent, asked before the paper is dealt and never after. */
export function OnyxStartAssessment({ assessment }: { assessment: Assessment }) {
  const router = useRouter();
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4 rounded-2xl border border-line p-4">
      <div className="text-sm text-slate-700">
        <p>
          {assessment.duration_minutes} minutes once you start. The timer runs on the server,
          so closing the tab does not stop it.
        </p>
        {assessment.attempts_allowed > 1 ? (
          <p className="mt-1">You may attempt this {assessment.attempts_allowed} times.</p>
        ) : <p className="mt-1">You get one attempt.</p>}
      </div>

      {assessment.proctoring ? (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">This assessment is monitored.</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            <li>Leaving the tab, pasting and copying are recorded.</li>
            {assessment.require_camera ? <li>Your camera must stay on.</li> : null}
            {assessment.require_screen ? <li>Your screen is shared with the invigilator.</li> : null}
            <li>An invigilator reviews anything flagged. A flag is not an accusation.</li>
          </ul>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consented}
              onChange={(e) => setConsented(e.target.checked)} />
            I understand and agree to be monitored for this attempt.
          </label>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}

      <button
        type="button"
        disabled={pending || (Boolean(assessment.proctoring) && !consented)}
        onClick={() => start(async () => {
          setError(null);
          const res = await fetch('/api/proxy/onyx/assessments/' + assessment.id + '/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consent: consented }),
          });
          const body = await res.json().catch(() => ({}));
          if (!body.ok) { setError(body.message ?? 'Could not start.'); return; }
          router.push('/onyx/attempts/' + body.data.id);
          router.refresh();
        })}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white
                   hover:bg-brand-700 disabled:opacity-50"
      >
        Start
      </button>
    </div>
  );
}
