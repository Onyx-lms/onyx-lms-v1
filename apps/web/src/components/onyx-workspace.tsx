'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { OnyxEditor } from './onyx-editor';

/**
 * LAB-05 -- the project workspace.
 *
 * The file tree, the editor, snapshots and mentor comments in one screen,
 * because moving between them is the work. Two things are deliberate:
 *
 *   * **Restore asks first.** It replaces the tree exactly, including deleting
 *     files added since, which is the feature -- and is also destructive, so it
 *     is not a single unlabelled click.
 *   * **A mentor comments; a mentor does not edit.** The editor is read-only
 *     for anyone who is not the owner, matching what the API allows rather than
 *     letting someone type into a box whose save will be refused.
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

  return (
    <div className="space-y-4">
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <aside className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Files</div>
            <ul className="mt-1 space-y-0.5 text-sm">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setActive(f.path)}
                    className={'w-full truncate rounded px-2 py-1 text-left font-mono text-xs '
                      + (f.path === active ? 'bg-brand-600 text-white' : 'hover:bg-slate-100')}
                  >
                    {f.path}
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
              <input id="newfile" name="path" placeholder="new-file.py"
                className="w-full rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs" />
            </form>
          ) : null}
        </aside>

        <div className="space-y-3">
          <OnyxEditor
            value={current?.content ?? ''}
            language={workspace.language}
            readOnly={!isOwner}
            onChange={(next) => setFiles((list) =>
              list.map((f) => (f.path === active ? { ...f, content: next } : f)))}
          />

          {isOwner ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button" disabled={pending}
                onClick={() => call('/files', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    files: files.map((f) => ({ path: f.path, content: f.content })),
                  }),
                }, 'Saved.')}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white
                           hover:bg-brand-700 disabled:opacity-50"
              >
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
                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700
                           hover:bg-slate-50 disabled:opacity-50"
              >
                Take a snapshot
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted">
              You are reviewing this project. Leave a comment rather than editing it.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Snapshots</h2>
          <ul className="mt-2 space-y-2 text-sm">
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
                    className="text-xs text-brand-600 hover:underline disabled:opacity-50"
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

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Review</h2>
          <ul className="mt-2 space-y-2 text-sm">
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
                    className="ml-2 text-xs text-brand-600 hover:underline disabled:opacity-50"
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
