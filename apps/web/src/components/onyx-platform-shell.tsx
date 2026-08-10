import Link from 'next/link';
import { OnyxBrand } from '@/components/onyx-brand';
import { PlatformSignOut } from '@/components/onyx-platform-forms';

/**
 * The platform console's own shell -- not OnyxShell.
 *
 * OnyxShell's whole header is a tenant switcher: an institution's name, its
 * role labels, a list of other institutions the signed-in person belongs to.
 * None of that exists for a platform admin, who is not a member of any
 * institution by virtue of holding this session. Reusing OnyxShell here
 * would mean either passing it a fake tenant or teaching it a "no tenant"
 * mode -- both bend a component whose whole point is "you are always inside
 * exactly one institution" to describe someone who, on this page, is not.
 */
export function OnyxPlatformShell({ email, title, subtitle, children }: {
  email: string; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="container-page grid gap-8 py-8 lg:grid-cols-[220px_1fr]">
      <aside>
        <Link href="/onyx/platform" className="inline-block rounded-lg focus-visible:outline-none">
          <OnyxBrand className="mb-1" />
        </Link>
        <p className="mb-4 text-xs uppercase tracking-wide text-muted">Platform console</p>
        <nav className="space-y-1">
          <Link href="/onyx/platform"
            className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Institutions
          </Link>
          <Link href="/onyx/platform/admins"
            className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            Platform admins
          </Link>
        </nav>
        <div className="mt-4 rounded-2xl border border-line p-3">
          <div className="truncate text-xs text-muted" title={email}>{email}</div>
          <PlatformSignOut />
        </div>
      </aside>
      <section>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
