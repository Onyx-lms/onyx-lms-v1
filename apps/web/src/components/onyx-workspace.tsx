'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { OnyxEditor } from './onyx-editor';
import { Icon } from './onyx-ui';
import type { WorkspaceRunResult } from '@/lib/onyx-codelab';

/** A file's extension, coloured -- the same shorthand every IDE file tree
 *  uses so a project reads at a glance rather than one filename at a time. */
const EXT_DOT: Record<string, string> = {
  py: 'bg-amber-400', js: 'bg-yellow-400', jsx: 'bg-sky-400',
  ts: 'bg-blue-400', tsx: 'bg-blue-400', java: 'bg-orange-500',
  c: 'bg-slate-400', cpp: 'bg-indigo-400', go: 'bg-cyan-400', rs: 'bg-orange-500',
  json: 'bg-lime-400', md: 'bg-slate-400', html: 'bg-red-400', css: 'bg-purple-400',
};
function extDot(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return EXT_DOT[ext] ?? 'bg-slate-400';
}

/** A keyboard chord, styled as a keycap -- decorative, but it is what tells
 *  someone Ctrl/Cmd+Enter is a real shortcut and not a decoration itself. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5
                     font-mono text-[10px] text-slate-300">
      {children}
    </kbd>
  );
}

/**
 * LAB-05 -- the project workspace.
 *
 * The file tree, the editor, snapshots and mentor comments in one screen,
 * because moving between them is the work. Four things are deliberate:
 *
 *   * **One dark surface, not a light toolbar bolted onto a dark editor.**
 *     Every real reference for this (VS Code, Codespaces, Replit, Codecademy's
 *     own teaching IDE) keeps chrome and editor the same theme; a white bar
 *     sitting directly on black is the tell of an unfinished screen, not a
 *     stylistic choice.
 *   * **Restore asks first.** It replaces the tree exactly, including deleting
 *     files added since, which is the feature -- and is also destructive, so it
 *     is not a single unlabelled click.
 *   * **A mentor comments; a mentor does not edit.** The editor is read-only
 *     for anyone who is not the owner, matching what the API allows rather than
 *     letting someone type into a box whose save will be refused.
 *   * **Run answers in the same request.** `/workspaces/:id/run` is not the
 *     queued path `/problems/:id/submit` uses -- one owner running one file
 *     has nothing to batch, so there is no submission id to poll here, only a
 *     result to show.
 */
export interface WsFile { id: number; path: string; content: string }
export interface WsSnapshot { id: number; label: string; created_at: string; file_count: number }
export interface WsComment {
  id: number; file_path: string | null; line: number | null;
  body: string; author_id: number | null; resolved_at: string | null; created_at: string;
}

export function OnyxWorkspace({ workspace, isOwner, canReview }: {
  workspace: {
    id: number; title: string; language: string; entry_path: string;
    files: WsFile[]; snapshots: WsSnapshot[]; comments: WsComment[];
  };
  isOwner: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(workspace.files);
  const [active, setActive] = useState(
    workspace.files.find((f) => f.path === workspace.entry_path)?.path
    ?? workspace.files[0]?.path ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<WorkspaceRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const current = files.find((f) => f.path === active);

  const call = (path: string, init: RequestInit, ok: string, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fetch('/api/proxy/onyx/workspaces/' + workspace.id + path, init);
      const body = await res.json().catch(() => ({}));
      if (!body.ok) { setError(body.message ?? 'That did not work.'); return; }
      setNotice(ok);
      after?.();
      router.refresh();
    });

  /**
   * Saves, then answers straight away -- see the note above on why this does
   * not poll.
   *
   * The server reads a run's file from what is persisted, not from a request
   * body -- a workspace file is a row, same as everything else here, and
   * "run whatever the browser currently has open" would mean a run and a
   * restart-mid-session could disagree about what actually ran. That means
   * skipping the save is what silently ran the file's last-saved content --
   * usually the empty string a new file starts as -- while the editor showed
   * whatever had just been typed. Codecademy's own teaching IDE names this
   * plainly, "Save + Run", rather than pretending the two are one action that
   * happens to save as a side effect.
   */
  const run = async () => {
    if (running) return; // the Ctrl+Enter shortcut bypasses the button's own disabled state
    setRunError(null);
    setRunResult(null);
    setRunning(true);
    try {
      const saveRes = await fetch('/api/proxy/onyx/workspaces/' + workspace.id + '/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: files.map((f) => ({ path: f.path, content: f.content })) }),
      });
      const saveBody = await saveRes.json().catch(() => ({}));
      if (!saveBody.ok) { setRunError(saveBody.message ?? 'Could not save before running.'); return; }

      const res = await fetch('/api/proxy/onyx/workspaces/' + workspace.id + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: active }),
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) { setRunError(body.message ?? 'That did not run.'); return; }
      setRunResult(body.data as WorkspaceRunResult);
      router.refresh(); // the save above changed updated_at server-side too
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {/* One dark instrument -- sidebar, toolbar, editor and console all the
          same surface, elevated off the page rather than bordered onto it. */}
      <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-xl shadow-slate-900/25 ring-1 ring-slate-800">
        <div className="grid lg:grid-cols-[220px_1fr]">
          <aside className="flex flex-col gap-4 border-b border-slate-800 bg-slate-950/50 p-3
                             lg:border-b-0 lg:border-r">
            {/* Purely decorative window chrome -- three dots is the fastest
                possible signal that what follows is a code surface. */}
            <div aria-hidden="true" className="flex items-center gap-1.5 px-1 pt-0.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            </div>

            <div>
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Files
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {files.map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => setActive(f.path)}
                      className={'flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 '
                        + 'text-left font-mono text-xs transition-colors '
                        + (f.path === active
                          ? 'bg-slate-800 text-white ring-1 ring-inset ring-brand-500/50'
                          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200')}
                    >
                      <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + extDot(f.path)} />
                      <span className="truncate">{f.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {isOwner ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const path = String(new FormData(form).get('path') ?? '').trim();
                  if (!path) return;
                  call('/files', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: [{ path, content: '' }] }),
                  }, 'File added.', () => {
                    setFiles((list) => [...list, { id: -Date.now(), path, content: '' }]);
                    setActive(path);
                  });
                  form.reset();
                }}
              >
                <label className="sr-only" htmlFor="newfile">New file</label>
                <input id="newfile" name="path" placeholder="+ new-file.py"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1.5
                             font-mono text-xs text-slate-200 placeholder:text-slate-500
                             focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40" />
              </form>
            ) : null}
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-2.5">
              <span className={'h-2 w-2 shrink-0 rounded-full ' + extDot(active)} />
              <span className="truncate font-mono text-xs text-slate-300">
                {active || workspace.entry_path}
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold
                                uppercase tracking-wide text-slate-400">
                {workspace.language}
              </span>

              {isOwner ? (
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button" disabled={running}
                    onClick={run}
                    title="Save and run -- Ctrl / Cmd + Enter"
                    className="group inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b
                               from-brand-500 to-brand-600 px-3.5 py-1.5 text-sm font-medium text-white
                               shadow-md shadow-brand-900/30 transition
                               hover:-translate-y-px hover:shadow-lg hover:shadow-brand-900/40
                               disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
                  >
                    {running
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2
                                          border-white/30 border-t-white" />
                      : <Icon name="play" className="h-3.5 w-3.5" />}
                    {running ? 'Running…' : 'Run'}
                  </button>
                  <button
                    type="button" disabled={pending}
                    onClick={() => call('/files', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        files: files.map((f) => ({ path: f.path, content: f.content })),
                      }),
                    }, 'Saved.')}
                    title="Save"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700
                               bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 transition
                               hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                  >
                    <Icon name="save" className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    type="button" disabled={pending}
                    onClick={() => {
                      const label = window.prompt('Name this snapshot', 'Snapshot');
                      if (label === null) return;
                      call('/snapshots', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label }),
                      }, 'Snapshot taken.');
                    }}
                    title="Take a snapshot"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700
                               bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 transition
                               hover:border-slate-600 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                  >
                    <Icon name="camera" className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Snapshot</span>
                  </button>
                </div>
              ) : (
                <span className="ml-auto rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                  Reviewing -- leave a comment rather than editing
                </span>
              )}
            </div>

            <OnyxEditor
              value={current?.content ?? ''}
              language={workspace.language}
              readOnly={!isOwner}
              onChange={(next) => setFiles((list) =>
                list.map((f) => (f.path === active ? { ...f, content: next } : f)))}
              onRunShortcut={isOwner ? run : undefined}
            />

            {runError ? (
              <p role="alert" className="border-t border-slate-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
                {runError}
              </p>
            ) : null}
            {runResult ? (
              <RunConsole result={runResult} onClear={() => setRunResult(null)} />
            ) : isOwner ? (
              <div className="flex items-center gap-1.5 border-t border-slate-800 bg-slate-950/40
                               px-4 py-2.5 text-xs text-slate-500">
                Click Run, or press <Key>Ctrl/Cmd + Enter</Key>, to see output here.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Snapshots</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {workspace.snapshots.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="flex-1">
                  {s.label}
                  <span className="block text-xs text-muted">
                    {new Date(s.created_at).toLocaleString()} · {s.file_count} files
                  </span>
                </span>
                {isOwner ? (
                  <button
                    type="button" disabled={pending}
                    onClick={() => {
                      // Restoring deletes files added since the snapshot. That
                      // is the promise, and it is also destructive.
                      const sure = window.confirm(
                        'Restore "' + s.label + '"? This replaces the file tree exactly as it '
                        + 'was, including removing files added since.');
                      if (!sure) return;
                      call('/restore/' + s.id, { method: 'POST' }, 'Restored.');
                    }}
                    className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                  >
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
            {workspace.snapshots.length === 0
              ? <li className="text-muted">No snapshots yet.</li>
              : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Review</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {workspace.comments.map((c) => (
              <li key={c.id} className={c.resolved_at ? 'text-muted' : 'text-slate-700'}>
                {c.file_path ? (
                  <span className="font-mono text-xs text-muted">
                    {c.file_path}{c.line ? ':' + c.line : ''}{' '}
                  </span>
                ) : null}
                {c.body}
                {c.resolved_at ? <span className="ml-2 text-xs">resolved</span> : (
                  <button
                    type="button" disabled={pending}
                    onClick={() => call('/comments/' + c.id + '/resolve', { method: 'POST' },
                      'Resolved.')}
                    className="ml-2 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                  >
                    resolve
                  </button>
                )}
              </li>
            ))}
            {workspace.comments.length === 0
              ? <li className="text-muted">Nothing yet.</li>
              : null}
          </ul>

          {canReview || isOwner ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const body = String(new FormData(form).get('body') ?? '').trim();
                if (!body) return;
                call('/comments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ body, file_path: active || null }),
                }, 'Comment added.');
                form.reset();
              }}
            >
              <label className="sr-only" htmlFor="comment">Comment</label>
              <input id="comment" name="body" placeholder={'Comment on ' + (active || 'this project')}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              <button type="submit" disabled={pending}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700
                           hover:bg-slate-50 disabled:opacity-50">
                Add
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const VERDICT_LABEL: Record<WorkspaceRunResult['verdict'], string> = {
  ok: 'Ran',
  compile_error: 'Did not compile',
  runtime_error: 'Runtime error',
  timeout: 'Timed out',
  memory_exceeded: 'Used too much memory',
  output_exceeded: 'Output was too long, truncated',
  internal_error: 'Could not run',
};

/** What Run answers with. Not the graded Console in onyx-codelab -- there is
 *  no pass/fail here, only what the file printed. */
function RunConsole({ result, onClear }: { result: WorkspaceRunResult; onClear: () => void }) {
  const ok = result.verdict === 'ok';
  return (
    <section className="border-t border-slate-800">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/60 px-4 py-2">
        {/* The dot is decorative -- the label carries the meaning, same rule
            as the login page's underlined link: colour alone never does. */}
        <span aria-hidden="true" className={'h-2 w-2 shrink-0 rounded-full '
          + (ok ? 'bg-emerald-400' : 'bg-rose-400')} />
        <span className={'text-sm font-medium ' + (ok ? 'text-emerald-400' : 'text-rose-400')}>
          {VERDICT_LABEL[result.verdict]}
        </span>
        <span className="font-mono text-xs text-slate-500">{result.path}</span>
        {result.runtimeMs ? <span className="text-xs text-slate-500">{result.runtimeMs}ms</span> : null}
        {result.memoryKb ? (
          <span className="text-xs text-slate-500">{Math.round(result.memoryKb / 1024)}MB</span>
        ) : null}
        <button
          type="button" onClick={onClear} title="Clear output"
          className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
        >
          <Icon name="trash" className="h-3.5 w-3.5" />
          <span className="sr-only">Clear output</span>
        </button>
      </header>
      {result.compileOutput ? (
        <pre className="overflow-x-auto border-b border-slate-800 bg-amber-950/30 p-3 text-xs text-amber-300">
          {result.compileOutput}
        </pre>
      ) : null}
      {result.stdout ? (
        <pre className="overflow-x-auto border-b border-slate-800 bg-slate-950 p-3 text-xs text-slate-100">
          {result.stdout}
        </pre>
      ) : null}
      {result.stderr ? (
        <pre className="overflow-x-auto bg-slate-950 p-3 text-xs text-rose-400">{result.stderr}</pre>
      ) : null}
      {ok && !result.stdout && !result.stderr ? (
        <p className="bg-slate-950 px-4 py-3 text-xs text-slate-500">Ran with no output.</p>
      ) : null}
    </section>
  );
}
