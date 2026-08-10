'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ROLE_LABELS } from '@/lib/onyx-nav';
import type { Role } from '@/lib/onyx-session';

/**
 * F-04 / F-06 -- the roster of one institution.
 *
 * Read-only for faculty, editable by an administrator. Both go through the same
 * API, which enforces the same thing again; hiding the controls only avoids
 * offering an action that would be refused.
 */
export interface Member {
  id: number;
  role: Role;
  tenant_id: number;
  user: { id: number; name: string; email: string } | null;
}

const ROLES: Role[] = ['student', 'faculty', 'exams', 'placement', 'admin'];

const field = 'rounded-lg border border-slate-300 px-3 py-2 text-sm '
  + 'focus:border-slate-900 focus:outline-none';

export function OnyxPeople({ members, canEdit }: { members: Member[]; canEdit: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const call = (path: string, init: RequestInit, success: string) => {
    setNotice(null);
    start(async () => {
      const res = await fetch('/api/proxy/onyx/' + path, init);
      const body = await res.json().catch(() => ({}));
      if (!body.ok) {
        setNotice({ tone: 'bad', text: body.message ?? 'That did not work.' });
        return;
      }
      setNotice({ tone: 'ok', text: success });
      router.refresh();
    });
  };

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? members.filter((m) =>
      (m.user?.name ?? '').toLowerCase().includes(needle)
      || (m.user?.email ?? '').toLowerCase().includes(needle))
    : members;

  return (
    <div className="space-y-6">
      {notice ? (
        <p
          role="status"
          className={'rounded-lg px-3 py-2 text-sm '
            + (notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}
        >
          {notice.text}
        </p>
      ) : null}

      {canEdit ? (
        <form
          className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            call('members', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: String(data.get('name') ?? ''),
                email: String(data.get('email') ?? ''),
                role: String(data.get('role') ?? 'student'),
                password: String(data.get('password') ?? '') || undefined,
              }),
            }, 'Added.');
            form.reset();
          }}
        >
          <input name="name" required placeholder="Name" className={field} />
          <input name="email" type="email" required placeholder="Email address" className={field} />
          <select name="role" defaultValue="student" aria-label="Role" className={field}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <input name="password" type="password" minLength={8}
            placeholder="Temporary password" className={field} />
          <button type="submit" disabled={pending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white
                       hover:bg-slate-800 disabled:opacity-50">
            Add
          </button>
          <p className="text-xs text-slate-500 sm:col-span-5">
            Someone who already has an Onyx account keeps it &mdash; they are attached to this
            institution rather than given a second one.
          </p>
        </form>
      ) : null}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email"
        aria-label="Search people"
        className={field + ' w-full sm:max-w-xs'}
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              {canEdit ? <th className="px-4 py-3"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{m.user?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{m.user?.email ?? '—'}</td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <select
                      aria-label={'Role for ' + (m.user?.name ?? 'this member')}
                      defaultValue={m.role}
                      disabled={pending}
                      className={field}
                      onChange={(e) => call('members/' + m.id, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: e.target.value }),
                      }, 'Role updated.')}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  ) : ROLE_LABELS[m.role]}
                </td>
                {canEdit ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => call('members/' + m.id, { method: 'DELETE' }, 'Removed.')}
                      className="text-sm text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 4 : 3} className="px-4 py-8 text-center text-slate-500">
                  {members.length === 0 ? 'Nobody here yet.' : 'Nobody matches that.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
