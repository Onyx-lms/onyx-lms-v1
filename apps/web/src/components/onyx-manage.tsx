'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/onyx-ui';

/**
 * The management surfaces that take a LIST rather than a record.
 *
 * `CreatePanel` covers "fill in some fields and POST them". These five do
 * not fit that shape: marks are one row per candidate, a fee structure is a
 * set of lines, a problem needs several test cases, seating takes a set of
 * halls. Each is small, but each needs to add and remove rows before it
 * submits, so they live here rather than being bent into the field-spec
 * component.
 */

const input = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm '
  + 'focus:border-brand-600 focus:outline-none';
const btn = 'rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white '
  + 'hover:bg-brand-700 disabled:opacity-60';
const ghost = 'rounded-xl border border-line px-3 py-2 text-sm font-semibold';

async function send(path: string, body?: unknown,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST') {
  const res = await fetch('/api/proxy/onyx/' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: false, message: 'Something went wrong.' }));
}

function Shell({ title, open, setOpen, cta, children, onSubmit, pending, error }: {
  title: string; open: boolean; setOpen: (v: boolean) => void; cta: string;
  children: React.ReactNode; onSubmit: () => void; pending: boolean; error: string | null;
}) {
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2
                   text-[13px] font-semibold text-white hover:bg-brand-700">
        <Icon name="edit" className="h-4 w-4" />{cta}
      </button>
    );
  }
  return (
    <form className="rounded-2xl border border-line bg-white p-4 shadow-card"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cancel"
          className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted">
          ✕
        </button>
      </div>
      {children}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={pending} className={btn}>
          {pending ? 'Saving…' : cta}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ghost}>Cancel</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------ CMP-02: seating ---- */

export function AllocateSeating({ examId, halls }: {
  examId: number; halls: { id: number; code: string; name: string; capacity: number }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Shell title="Allocate seating" cta="Allocate seating" open={open} setOpen={setOpen}
      pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        const res = await send(`exams/${examId}/seating`, { hall_ids: picked });
        if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
        setOpen(false); router.refresh();
      })}>
      <p className="mb-2 text-xs text-muted">
        Every candidate gets one seat and no seat gets two, enforced by the database.
        Re-running replaces the plan rather than adding to it.
      </p>
      <ul className="space-y-1.5">
        {halls.map((h) => (
          <li key={h.id}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                checked={picked.includes(h.id)}
                onChange={(e) => setPicked((p) =>
                  e.target.checked ? [...p, h.id] : p.filter((x) => x !== h.id))} />
              <span className="font-medium">{h.code}</span>
              <span className="text-muted">{h.name} · {h.capacity} seats</span>
            </label>
          </li>
        ))}
        {halls.length === 0 ? (
          <li className="text-sm text-muted">Add a hall first.</li>
        ) : null}
      </ul>
    </Shell>
  );
}

/* -------------------------------------------------------- CMP-02: marks ---- */

export function EnterMarks({ examId, maxMarks, candidates }: {
  examId: number; maxMarks: number;
  candidates: { user_id: number; name: string; current?: number | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState<Record<number, string>>(
    Object.fromEntries(candidates.map((c) => [c.user_id,
      c.current === null || c.current === undefined ? '' : String(c.current)])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Shell title="Enter marks" cta="Enter marks" open={open} setOpen={setOpen}
      pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        // Only the boxes that were actually filled in -- a blank is "not
        // marked yet", not a zero, and sending it as one would fail a
        // candidate who simply has not been marked.
        const entries = candidates
          .filter((c) => String(marks[c.user_id] ?? '').trim() !== '')
          .map((c) => ({ user_id: c.user_id, raw_marks: Number(marks[c.user_id]) }));
        if (!entries.length) { setError('Nothing to save.'); return; }
        const res = await send(`exams/${examId}/marks`, { entries });
        if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
        setOpen(false); router.refresh();
      })}>
      <p className="mb-2 text-xs text-muted">
        Out of {maxMarks}. A learner sees nothing until results are published.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {candidates.map((c) => (
          <li key={c.user_id} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 text-sm">{c.name}</span>
            <label className="sr-only" htmlFor={'mark-' + c.user_id}>
              Marks for {c.name}
            </label>
            <input id={'mark-' + c.user_id} type="number" min={0} max={maxMarks}
              value={marks[c.user_id] ?? ''} className={input + ' w-24 text-right'}
              onChange={(e) => setMarks((m) => ({ ...m, [c.user_id]: e.target.value }))} />
          </li>
        ))}
        {candidates.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted">Nobody is enrolled in this course.</li>
        ) : null}
      </ul>
    </Shell>
  );
}

/* ----------------------------------------------- CMP-03: fee structures ---- */

export function BuildFeeStructure({ heads }: {
  heads: { id: number; code: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [instalments, setInstalments] = useState('1');
  const [lines, setLines] = useState<{ head_id: string; rupees: string }[]>(
    [{ head_id: '', rupees: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Shell title="New fee structure" cta="Build a fee structure" open={open} setOpen={setOpen}
      pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        const clean = lines
          .filter((l) => l.head_id && l.rupees !== '')
          // Money is stored in paise. Entering rupees and multiplying here
          // keeps the decimal out of the database entirely.
          .map((l) => ({
            head_id: Number(l.head_id),
            amount_minor: Math.round(Number(l.rupees) * 100),
          }));
        if (!clean.length) { setError('Add at least one line.'); return; }
        const made = await send('fee-structures',
          { name, instalments: Number(instalments), lines: clean });
        if (!made.ok) { setError(made.message ?? 'That did not work.'); return; }
        const pub = await send(`fee-structures/${made.data.id}/publish`);
        if (!pub.ok) { setError(pub.message ?? 'Created, but not published.'); return; }
        setOpen(false); router.refresh();
      })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="fs-name">
            Name
          </label>
          <input id="fs-name" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Term 1 fees" className={input + ' mt-1 w-full'} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="fs-inst">
            Instalments
          </label>
          <input id="fs-inst" type="number" min={1} max={12} value={instalments}
            onChange={(e) => setInstalments(e.target.value)} className={input + ' mt-1 w-full'} />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <label className="sr-only" htmlFor={'fs-head-' + i}>Fee head</label>
            <select id={'fs-head-' + i} value={l.head_id} className={input + ' flex-1'}
              onChange={(e) => setLines((ls) =>
                ls.map((x, j) => (j === i ? { ...x, head_id: e.target.value } : x)))}>
              <option value="">Choose a fee head…</option>
              {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <label className="sr-only" htmlFor={'fs-amt-' + i}>Amount in rupees</label>
            <input id={'fs-amt-' + i} type="number" min={0} step="0.01" placeholder="Rupees"
              value={l.rupees} className={input + ' w-36'}
              onChange={(e) => setLines((ls) =>
                ls.map((x, j) => (j === i ? { ...x, rupees: e.target.value } : x)))} />
            <button type="button" aria-label={'Remove line ' + (i + 1)} className={ghost}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className={ghost}
          onClick={() => setLines((ls) => [...ls, { head_id: '', rupees: '' }])}>
          Add a line
        </button>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------- LAB-03: test cases ---- */

export function TestCases({ problemId }: { problemId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState([
    { stdin: '', expected_stdout: '', is_hidden: false },
    { stdin: '', expected_stdout: '', is_hidden: true },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Shell title="Test cases" cta="Set test cases and publish" open={open} setOpen={setOpen}
      pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        const clean = cases.filter((c) => c.expected_stdout.trim() !== '');
        if (!clean.length) { setError('A test needs expected output.'); return; }
        if (!clean.some((c) => !c.is_hidden)) {
          setError('At least one case has to be visible — otherwise a learner '
            + 'only learns that they were wrong.');
          return;
        }
        const saved = await send(`problems/${problemId}/tests`, { tests: clean }, 'PUT');
        if (!saved.ok) { setError(saved.message ?? 'That did not work.'); return; }
        const pub = await send(`problems/${problemId}/publish`);
        if (!pub.ok) { setError(pub.message ?? 'Saved, but not published.'); return; }
        setOpen(false); router.refresh();
      })}>
      <p className="mb-2 text-xs text-muted">
        A hidden case stops the answer being read off the examples. At least one has to
        be visible, and the problem cannot be published without them.
      </p>
      <div className="space-y-3">
        {cases.map((c, i) => (
          <div key={i} className="rounded-xl border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold" htmlFor={'tc-in-' + i}>Input</label>
                <textarea id={'tc-in-' + i} rows={2} value={c.stdin}
                  className={input + ' mt-1 w-full font-mono text-xs'}
                  onChange={(e) => setCases((cs) =>
                    cs.map((x, j) => (j === i ? { ...x, stdin: e.target.value } : x)))} />
              </div>
              <div>
                <label className="block text-xs font-semibold" htmlFor={'tc-out-' + i}>
                  Expected output
                </label>
                <textarea id={'tc-out-' + i} rows={2} value={c.expected_stdout}
                  className={input + ' mt-1 w-full font-mono text-xs'}
                  onChange={(e) => setCases((cs) =>
                    cs.map((x, j) => (j === i ? { ...x, expected_stdout: e.target.value } : x)))} />
              </div>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={c.is_hidden}
                className="h-4 w-4 rounded border-slate-300"
                onChange={(e) => setCases((cs) =>
                  cs.map((x, j) => (j === i ? { ...x, is_hidden: e.target.checked } : x)))} />
              Hidden from the learner
            </label>
          </div>
        ))}
        <button type="button" className={ghost}
          onClick={() => setCases((cs) =>
            [...cs, { stdin: '', expected_stdout: '', is_hidden: true }])}>
          Add a case
        </button>
      </div>
    </Shell>
  );
}

/* -------------------------------------------- ASS-01a: bank questions ---- */

const QUESTION_TYPES = [
  { value: 'single', label: 'One correct answer' },
  { value: 'multiple', label: 'Several correct answers' },
  { value: 'truefalse', label: 'True or false' },
  { value: 'short', label: 'Short answer' },
  { value: 'essay', label: 'Essay (marked by hand)' },
] as const;

/**
 * One question, into one bank.
 *
 * The answer key is part of the same form as the options because the API
 * refuses a choice question whose answer is not one of its own options -- a
 * rule worth meeting at the point of typing rather than discovering on save.
 * An essay carries no key at all: it is marked by a person.
 */
export function AddQuestion({ bankId }: { bankId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>('single');
  const [prompt, setPrompt] = useState('');
  const [points, setPoints] = useState('1');
  const [options, setOptions] = useState([
    { id: 'a', text: '' }, { id: 'b', text: '' },
  ]);
  const [correct, setCorrect] = useState<string[]>([]);
  const [answer, setAnswer] = useState('false');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choice = type === 'single' || type === 'multiple';

  return (
    <Shell title="New question" cta="Add a question" open={open} setOpen={setOpen}
      pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        const body: Record<string, unknown> = { type, prompt, points: Number(points) || 1 };
        if (choice) {
          const clean = options.filter((o) => o.text.trim());
          if (clean.length < 2) { setError('A choice question needs two options.'); return; }
          body.options = clean;
          const picked = correct.filter((id) => clean.some((o) => o.id === id));
          if (!picked.length) { setError('Mark which option is correct.'); return; }
          body.answer = type === 'multiple' ? picked : picked[0];
        } else if (type === 'truefalse') {
          body.answer = answer === 'true' ? 'true' : 'false';
        } else if (type === 'short') {
          const accepted = answer.split('\n').map((a) => a.trim()).filter(Boolean);
          if (!accepted.length) { setError('Give at least one accepted answer.'); return; }
          body.answer = accepted;
        }
        const res = await send('banks/' + bankId + '/questions', body);
        if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
        setPrompt('');
        setOptions([{ id: 'a', text: '' }, { id: 'b', text: '' }]);
        setCorrect([]);
        setAnswer('false');
        setOpen(false);
        router.refresh();
      })}>
      <div className="grid gap-3">
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="q-prompt">
            Question
          </label>
          <textarea id="q-prompt" required rows={3} value={prompt}
            onChange={(e) => setPrompt(e.target.value)} className={input + ' mt-1 w-full'} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="q-type">
              Type
            </label>
            <select id="q-type" value={type} onChange={(e) => setType(e.target.value)}
              className={input + ' mt-1 w-full'}>
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="q-points">
              Marks
            </label>
            <input id="q-points" type="number" min={1} max={1000} value={points}
              onChange={(e) => setPoints(e.target.value)} className={input + ' mt-1 w-full'} />
          </div>
        </div>

        {choice ? (
          <fieldset>
            <legend className="text-[13px] font-semibold text-slate-700">
              Options — tick the correct {type === 'multiple' ? 'ones' : 'one'}
            </legend>
            <ul className="mt-2 space-y-2">
              {options.map((o, i) => (
                <li key={o.id} className="flex items-center gap-2">
                  <input
                    type={type === 'multiple' ? 'checkbox' : 'radio'}
                    name="q-correct" className="h-4 w-4"
                    aria-label={'Option ' + o.id.toUpperCase() + ' is correct'}
                    checked={correct.includes(o.id)}
                    onChange={(e) => setCorrect(type === 'multiple'
                      ? (e.target.checked ? [...correct, o.id] : correct.filter((c) => c !== o.id))
                      : [o.id])} />
                  <input value={o.text} className={input + ' flex-1'}
                    aria-label={'Option ' + o.id.toUpperCase()}
                    placeholder={'Option ' + o.id.toUpperCase()}
                    onChange={(e) => setOptions(options.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x))} />
                </li>
              ))}
            </ul>
            <button type="button" className={ghost + ' mt-2'}
              onClick={() => setOptions([...options,
                { id: String.fromCharCode(97 + options.length), text: '' }])}>
              Add an option
            </button>
          </fieldset>
        ) : type === 'truefalse' ? (
          <div>
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="q-tf">
              Correct answer
            </label>
            <select id="q-tf" value={answer} onChange={(e) => setAnswer(e.target.value)}
              className={input + ' mt-1 w-full'}>
              <option value="false">False</option>
              <option value="true">True</option>
            </select>
          </div>
        ) : type === 'short' ? (
          <div>
            <label className="block text-[13px] font-semibold text-slate-700" htmlFor="q-short">
              Accepted answers
            </label>
            <textarea id="q-short" rows={3} value={answer}
              onChange={(e) => setAnswer(e.target.value)} className={input + ' mt-1 w-full'} />
            <p className="mt-1 text-xs text-muted">One per line. Any of them scores the mark.</p>
          </div>
        ) : (
          <p className="text-xs text-muted">
            An essay carries no answer key — it is marked by hand after the paper closes.
          </p>
        )}
      </div>
    </Shell>
  );
}

/* --------------------------------------------- ASS-01b: paper assembly ---- */

/**
 * A paper, assembled from banks.
 *
 * Each section draws `take` questions from one bank, so two candidates sit
 * different papers of the same shape. That is the point of a bank, and it is
 * why the sections are a list rather than a fixed field.
 */
export function BuildAssessment({ banks, courses }: {
  banks: { id: number; name: string }[];
  courses: { id: number; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [duration, setDuration] = useState('60');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [proctoring, setProctoring] = useState(false);
  const [requireCamera, setRequireCamera] = useState(false);
  const [requireScreen, setRequireScreen] = useState(false);
  const [sections, setSections] = useState([{ bank_id: '', take: '5' }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Shell title="New assessment" cta="Set a paper" open={open} setOpen={setOpen}
      pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        const clean = sections
          .filter((s) => s.bank_id && Number(s.take) > 0)
          .map((s, i) => ({
            id: 's' + (i + 1),
            title: 'Section ' + (i + 1),
            bank_id: Number(s.bank_id),
            take: Number(s.take),
          }));
        if (!clean.length) { setError('A paper needs at least one section.'); return; }
        const made = await send('assessments', {
          title,
          course_id: courseId ? Number(courseId) : null,
          duration_minutes: Number(duration) || 60,
          opens_at: opensAt ? new Date(opensAt).toISOString() : null,
          closes_at: closesAt ? new Date(closesAt).toISOString() : null,
          proctoring,
          // Only meaningful with monitoring on, and sending them otherwise
          // would leave a paper claiming a requirement it never enforces.
          require_camera: proctoring && requireCamera,
          require_screen: proctoring && requireScreen,
          sections: clean,
        });
        if (!made.ok) { setError(made.message ?? 'That did not work.'); return; }
        const pub = await send('assessments/' + made.data.id + '/publish');
        if (!pub.ok) { setError(pub.message ?? 'Created, but not published.'); return; }
        setOpen(false);
        router.refresh();
      })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="as-title">
            Title
          </label>
          <input id="as-title" required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Mid-term test" className={input + ' mt-1 w-full'} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="as-course">
            Course
          </label>
          <select id="as-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}
            className={input + ' mt-1 w-full'}>
            <option value="">Not tied to a course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="as-dur">
            Minutes
          </label>
          <input id="as-dur" type="number" min={1} max={1440} value={duration}
            onChange={(e) => setDuration(e.target.value)} className={input + ' mt-1 w-full'} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="as-open">
            Opens
          </label>
          <input id="as-open" type="datetime-local" value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)} className={input + ' mt-1 w-full'} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="as-close">
            Closes
          </label>
          <input id="as-close" type="datetime-local" value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)} className={input + ' mt-1 w-full'} />
        </div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700
                          sm:col-span-2">
          <input type="checkbox" checked={proctoring} className="h-4 w-4"
            onChange={(e) => setProctoring(e.target.checked)} />
          Monitor this paper
        </label>
        {/* Nested under monitoring because they mean nothing without it, and a
            candidate who is told their camera must stay on is refused the paper
            without one -- so this is a real decision, not a preference. */}
        {proctoring ? (
          <fieldset className="sm:col-span-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-[13px] font-semibold text-slate-700">
              What candidates must share
            </legend>
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={requireCamera} className="h-4 w-4"
                onChange={(e) => setRequireCamera(e.target.checked)} />
              Camera on for the whole paper
            </label>
            <label className="mt-2 flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={requireScreen} className="h-4 w-4"
                onChange={(e) => setRequireScreen(e.target.checked)} />
              Screen shared with the invigilator
            </label>
            <p className="mt-2 text-xs text-muted">
              No video is recorded or uploaded. What is stored is when each one started
              and stopped, and a candidate who refuses cannot start the paper.
            </p>
          </fieldset>
        ) : null}

        <fieldset className="sm:col-span-2">
          <legend className="text-[13px] font-semibold text-slate-700">Sections</legend>
          <ul className="mt-2 space-y-2">
            {sections.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <select value={s.bank_id} className={input + ' flex-1'}
                  aria-label={'Bank for section ' + (i + 1)}
                  onChange={(e) => setSections(sections.map((x, j) =>
                    j === i ? { ...x, bank_id: e.target.value } : x))}>
                  <option value="">Pick a bank</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <input type="number" min={1} max={500} value={s.take} className={input + ' w-24'}
                  aria-label={'Questions drawn for section ' + (i + 1)}
                  onChange={(e) => setSections(sections.map((x, j) =>
                    j === i ? { ...x, take: e.target.value } : x))} />
                <span className="text-xs text-muted">questions</span>
              </li>
            ))}
          </ul>
          <button type="button" className={ghost + ' mt-2'}
            onClick={() => setSections([...sections, { bank_id: '', take: '5' }])}>
            Add a section
          </button>
        </fieldset>
      </div>
    </Shell>
  );
}

/* --------------------------------------------- CAR-04c: drive rounds ---- */

const ROUND_OUTCOMES = [
  { value: 'attended', label: 'Attended' },
  { value: 'absent', label: 'Absent' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
] as const;

/**
 * What happened in one round of a drive.
 *
 * The candidate list is the shortlist for the post the drive runs against,
 * not the institution's roster: a company that came to interview six people
 * has no business being handed everyone's name.
 */
export function RecordRound({ roundId, roundName, candidates }: {
  roundId: number; roundName: string;
  candidates: { user_id: number; name: string; current?: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<number, string>>(
    Object.fromEntries(candidates.map((c) => [c.user_id, c.current ?? ''])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Shell title={'Record ' + roundName} cta={'Record ' + roundName}
      open={open} setOpen={setOpen} pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        const entries = candidates
          .filter((c) => outcomes[c.user_id])
          .map((c) => ({ user_id: c.user_id, outcome: outcomes[c.user_id] }));
        if (!entries.length) { setError('Nothing to record.'); return; }
        const res = await send('rounds/' + roundId + '/results', { entries });
        if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
        setOpen(false);
        router.refresh();
      })}>
      <p className="mb-2 text-xs text-muted">
        Leave somebody blank and they are simply not recorded for this round.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {candidates.map((c) => (
          <li key={c.user_id} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 text-sm">{c.name}</span>
            <label className="sr-only" htmlFor={'rd-' + roundId + '-' + c.user_id}>
              Outcome for {c.name}
            </label>
            <select id={'rd-' + roundId + '-' + c.user_id} className={input + ' w-40'}
              value={outcomes[c.user_id] ?? ''}
              onChange={(e) => setOutcomes((o) => ({ ...o, [c.user_id]: e.target.value }))}>
              <option value="">Not recorded</option>
              {ROUND_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </li>
        ))}
        {candidates.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted">
            Nobody has been shortlisted for the post this drive runs against.
          </li>
        ) : null}
      </ul>
    </Shell>
  );
}

/* ------------------------------------------------ CAR-04c: new drive ---- */

/**
 * A campus drive, with its rounds named up front.
 *
 * The rounds are part of creating it rather than a later step, because a
 * drive with no rounds cannot record anything, and that is exactly the state
 * a two-step flow leaves behind when the second step is forgotten.
 */
export function BuildDrive({ employers, jobs }: {
  employers: { id: number; name: string }[];
  jobs: { id: number; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employerId, setEmployerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [rounds, setRounds] = useState(['Aptitude test', 'Technical interview']);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Shell title="New drive" cta="Schedule a drive" open={open} setOpen={setOpen}
      pending={pending} error={error}
      onSubmit={() => start(async () => {
        setError(null);
        if (!employerId) { setError('Pick the employer coming to campus.'); return; }
        const named = rounds.map((r) => r.trim()).filter(Boolean);
        if (!named.length) { setError('A drive needs at least one round.'); return; }
        const res = await send('drives', {
          employer_id: Number(employerId),
          job_id: jobId ? Number(jobId) : null,
          title,
          venue: venue || null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          rounds: named.map((name) => ({ name })),
        });
        if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
        setOpen(false);
        router.refresh();
      })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="dr-title">
            Title
          </label>
          <input id="dr-title" required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Acme campus drive" className={input + ' mt-1 w-full'} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="dr-emp">
            Employer
          </label>
          <select id="dr-emp" value={employerId} className={input + ' mt-1 w-full'}
            onChange={(e) => setEmployerId(e.target.value)}>
            <option value="">Pick an employer</option>
            {employers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="dr-job">
            Against which post
          </label>
          <select id="dr-job" value={jobId} className={input + ' mt-1 w-full'}
            onChange={(e) => setJobId(e.target.value)}>
            <option value="">Not tied to a post</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="dr-when">
            When
          </label>
          <input id="dr-when" type="datetime-local" value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)} className={input + ' mt-1 w-full'} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="dr-venue">
            Where
          </label>
          <input id="dr-venue" value={venue} onChange={(e) => setVenue(e.target.value)}
            placeholder="Auditorium" className={input + ' mt-1 w-full'} />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="text-[13px] font-semibold text-slate-700">Rounds, in order</legend>
          <ul className="mt-2 space-y-2">
            {rounds.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <input value={r} className={input + ' flex-1'}
                  aria-label={'Round ' + (i + 1)}
                  onChange={(e) => setRounds(rounds.map((x, j) => (j === i ? e.target.value : x)))} />
                <button type="button" className={ghost} aria-label={'Remove round ' + (i + 1)}
                  onClick={() => setRounds(rounds.filter((_, j) => j !== i))}>✕</button>
              </li>
            ))}
          </ul>
          <button type="button" className={ghost + ' mt-2'}
            onClick={() => setRounds([...rounds, ''])}>
            Add a round
          </button>
        </fieldset>
      </div>
    </Shell>
  );
}

/* ------------------------------------------- CMP-04: guardian consent ---- */

const SCOPES = [
  { key: 'can_view_attendance', scope: 'attendance', label: 'Attendance' },
  { key: 'can_view_results', scope: 'results', label: 'Results' },
  { key: 'can_view_fees', scope: 'fees', label: 'Fees' },
] as const;

/**
 * The learner's side of a guardian link.
 *
 * An administrator can propose the link; only the learner can accept it, and
 * each category is off until they turn it on. That rule lives in the API, and
 * without this component there was no way to exercise it from a browser --
 * a link could be created and then never accepted, so `/onyx/family` stayed
 * permanently empty and the consent model was unreachable rather than strict.
 */
export function GuardianConsent({ links }: {
  links: {
    id: number; relationship: string; name: string | null; verified_at: string | null;
    can_view_attendance: boolean; can_view_results: boolean; can_view_fees: boolean;
  }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (path: string, body?: unknown, method: 'POST' | 'DELETE' = 'POST') =>
    start(async () => {
      setError(null);
      const res = await send(path, body, method as 'POST');
      if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
      router.refresh();
    });

  if (!links.length) {
    return (
      <p className="text-sm text-muted">
        Nobody has asked to follow your progress.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.id} className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold">{l.name ?? 'A guardian'}</div>
                <div className="text-xs capitalize text-muted">{l.relationship}</div>
              </div>
              {l.verified_at ? (
                <button type="button" disabled={pending}
                  onClick={() => act('guardians/' + l.id, undefined, 'DELETE')}
                  className="rounded-xl border border-rose-600 px-3 py-2 text-[13px]
                             font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                  Remove
                </button>
              ) : (
                <button type="button" disabled={pending}
                  onClick={() => act('guardians/' + l.id + '/accept')}
                  className="rounded-xl bg-brand-600 px-3 py-2 text-[13px] font-semibold
                             text-white hover:bg-brand-700 disabled:opacity-60">
                  Accept
                </button>
              )}
            </div>

            {l.verified_at ? (
              <fieldset className="mt-3">
                <legend className="text-[13px] font-semibold text-slate-700">
                  What they may see
                </legend>
                <ul className="mt-2 flex flex-wrap gap-4">
                  {SCOPES.map((s) => (
                    <li key={s.scope}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                          disabled={pending} checked={l[s.key]}
                          onChange={(e) => act('guardians/' + l.id + '/consent',
                            { scope: s.scope, allowed: e.target.checked })} />
                        {s.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : (
              <p className="mt-2 text-xs text-muted">
                Until you accept, they see nothing at all.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * CMP-01a -- which term the allocation screen is showing.
 *
 * In the query string rather than in component state, so the page a head of
 * department is looking at is the page they can send to somebody else, and a
 * refresh does not silently drop them back into the newest term.
 */
export function SemesterPicker({ semesters, selected }: {
  semesters: { id: number; name: string }[];
  selected: number;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="semester" className="block text-xs font-medium text-muted">
          Semester
        </label>
        <select
          id="semester" value={String(selected)}
          onChange={(e) => router.push('/onyx/allocations?semester=' + e.target.value)}
          className="mt-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm
                     focus:border-brand-600 focus:outline-none"
        >
          {semesters.map((s) => (
            <option key={s.id} value={String(s.id)}>{s.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
