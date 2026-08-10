'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Me, Role, Tenant } from '@/lib/onyx-session';
import { ROLE_LABELS } from '@/lib/onyx-nav';

/**
 * F-07 -- the Onyx shell, with the institution switcher built in.
 *
 * Which institution you are in is the single most consequential thing on the
 * screen, so it is named at the top rather than implied. When someone belongs
 * to more than one, switching is one control away and reloads everything --
 * because everything below is scoped to the tenant in the token.
 */
export interface OnyxNavItem { href: string; label: string }

export function OnyxShell({ me, nav, title, subtitle, children }: {
  me: Me;
  nav: OnyxNavItem[];
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="container-page grid gap-8 py-8 lg:grid-cols-[240px_1fr]">
      <aside>
        <TenantSwitcher tenant={me.tenant} role={me.role} memberships={me.memberships} />

        <nav className="mt-4 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={'block rounded-lg px-3 py-2 text-sm '
                  + (active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <div className="truncate text-xs text-slate-500" title={me.email}>{me.email}</div>
          <SignOutButton />
        </div>
      </aside>

      <section>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}

function TenantSwitcher({ tenant, role, memberships }: {
  tenant: Tenant; role: Role; memberships: { tenant: Tenant; role: Role }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const others = memberships.filter((m) => m.tenant.id !== tenant.id);

  const switchTo = (id: number) => {
    setError(null);
    start(async () => {
      const res = await fetch('/api/onyx/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) { setError(body.message ?? 'Could not switch.'); return; }
      setOpen(false);
      // A hard refresh, not a client transition: every server component below
      // was rendered against the old tenant.
      router.refresh();
      router.push('/onyx/dashboard');
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">Institution</div>
      <div className="mt-1 truncate text-sm font-semibold" title={tenant.name}>{tenant.name}</div>
      <div className="text-xs text-slate-500">{ROLE_LABELS[role]}</div>

      {others.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs
                       text-slate-700 hover:bg-slate-50"
          >
            Switch institution
          </button>
          {open ? (
            <ul className="mt-2 space-y-1">
              {others.map((m) => (
                <li key={m.tenant.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => switchTo(m.tenant.id)}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-xs
                               text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <span className="block truncate font-medium">{m.tenant.name}</span>
                    <span className="text-slate-500">{ROLE_LABELS[m.role]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        await fetch('/api/onyx/login', { method: 'DELETE' });
        router.push('/onyx/login');
        router.refresh();
      })}
      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs
                 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
