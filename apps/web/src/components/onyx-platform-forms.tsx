'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * The platform console's forms -- signing in, provisioning an institution,
 * suspending one, and granting or revoking who else can do any of this.
 *
 * Every write goes through /api/proxy/onyx/platform/*, which attaches the
 * `onyx_platform_session` cookie server-side (see the proxy route) rather
 * than a tenant cookie -- there is no tenant to attach here.
 */

const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm '
  + 'focus:border-slate-900 focus:outline-none';
const label = 'block text-sm font-medium text-slate-700';
const button = 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white '
  + 'hover:bg-brand-700 disabled:opacity-50';

function Error_({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </p>
  );
}

async function post(path: string, body?: unknown, method = 'POST') {
  const res = await fetch('/api/proxy/' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: false, message: 'Something went wrong.' }));
}

export function PlatformLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await fetch('/api/onyx-platform/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: String(data.get('email') ?? ''),
              password: String(data.get('password') ?? ''),
            }),
          });
          const body = await res.json().catch(() => ({ ok: false }));
          if (!body.ok) { setError(body.message ?? 'Those details do not match.'); return; }
          router.push('/onyx/platform');
          router.refresh();
        });
      }}
    >
      <Error_ message={error} />
      <div>
        <label className={label} htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required
          autoComplete="current-password" className={field} />
      </div>
      <button type="submit" disabled={pending} className={button + ' w-full'}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function PlatformSignOut() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        await fetch('/api/onyx-platform/login', { method: 'DELETE' });
        router.push('/onyx/platform/login');
        router.refresh();
      })}
      className="min-h-[38px] w-full rounded-2xl border border-line px-3 py-1.5 text-xs
                 font-medium text-slate-700 hover:bg-brand-50 disabled:opacity-50"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

export function CreateTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={button}>
        Create an institution
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await post('onyx/platform/tenants', {
            name: String(data.get('name') ?? ''),
            admin: {
              name: String(data.get('admin_name') ?? ''),
              email: String(data.get('admin_email') ?? ''),
              password: String(data.get('admin_password') ?? ''),
            },
          });
          if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <p className="text-xs text-muted">
        Provisioned directly, the way an operator sets one up on someone&rsquo;s
        behalf -- distinct from the self-service form at /onyx/signup.
      </p>
      <div>
        <label className={label} htmlFor="ct-name">Institution name</label>
        <input id="ct-name" name="name" required maxLength={255} className={field} />
      </div>
      <div>
        <label className={label} htmlFor="ct-admin-name">Administrator&rsquo;s name</label>
        <input id="ct-admin-name" name="admin_name" required maxLength={255} className={field} />
      </div>
      <div>
        <label className={label} htmlFor="ct-admin-email">Administrator&rsquo;s email</label>
        <input id="ct-admin-email" name="admin_email" type="email" required className={field} />
      </div>
      <div>
        <label className={label} htmlFor="ct-admin-password">Administrator&rsquo;s password</label>
        <input id="ct-admin-password" name="admin_password" type="password" required
          minLength={8} className={field} />
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={button}>
          {pending ? 'Creating…' : 'Create'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SuspendToggle({ tenantId, suspended }: { tenantId: number; suspended: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const res = await post('onyx/platform/tenants/' + tenantId
            + (suspended ? '/activate' : '/suspend'));
          if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
          router.refresh();
        })}
        className={'rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ' + (suspended
          ? 'border-emerald-600 text-emerald-700'
          : 'border-red-600 text-red-700')}
      >
        {pending ? 'Working…' : suspended ? 'Reactivate' : 'Suspend'}
      </button>
      {error ? <p role="alert" className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

export function GrantAdminForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await post('onyx/platform/admins', {
            email: String(data.get('email') ?? ''),
            name: String(data.get('name') ?? '') || undefined,
            password: String(data.get('password') ?? '') || undefined,
          });
          if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
          (e.target as HTMLFormElement).reset();
          router.refresh();
        });
      }}
    >
      <div>
        <label className={label} htmlFor="ga-email">Email</label>
        <input id="ga-email" name="email" type="email" required className={field} />
      </div>
      <div>
        <label className={label} htmlFor="ga-name">Name (new account only)</label>
        <input id="ga-name" name="name" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="ga-password">Password (new account only)</label>
        <input id="ga-password" name="password" type="password" minLength={8} className={field} />
      </div>
      <button type="submit" disabled={pending} className={button}>
        {pending ? 'Granting…' : 'Grant'}
      </button>
      {error ? <p role="alert" className="w-full text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

export function RevokeAdminButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const res = await post('onyx/platform/admins/' + id, undefined, 'DELETE');
          if (!res.ok) { setError(res.message ?? 'That did not work.'); return; }
          router.refresh();
        })}
        className="rounded-lg border border-red-600 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50"
      >
        {pending ? 'Working…' : 'Revoke'}
      </button>
      {error ? <p role="alert" className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
