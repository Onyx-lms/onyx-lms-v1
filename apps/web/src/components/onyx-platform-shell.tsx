import Link from 'next/link';
import { OnyxMark } from '@/components/onyx-brand';
import { PlatformSignOut } from '@/components/onyx-platform-forms';
import { PlatformNavLinks } from '@/components/onyx-platform-nav-links';

/**
 * The platform console's own shell -- not OnyxShell.
 *
 * OnyxShell's whole header is a tenant switcher: an institution's name, its
 * role labels, a list of other institutions the signed-in person belongs to.
 * None of that exists for a platform admin, who is not a member of any
 * institution by virtue of holding this session. Reusing OnyxShell here would
 * mean either passing it a fake tenant or teaching it a "no tenant" mode --
 * both bend a component whose whole point is "you are always inside exactly one
 * institution" to describe someone who, on this page, is not.
 *
 * What it does share is the chrome. Until now this was a bare grid with a
 * left-aligned link list, and it read as an internal tool bolted to the side of
 * the product -- which is roughly the opposite of the impression you want from
 * the screen that can suspend a paying customer. Same header, same sidebar
 * card, same type scale; the one deliberate difference is the band naming this
 * as the platform, because an operator who forgets which console they are in is
 * one click from acting on the wrong institution.
 */
export function OnyxPlatformShell({ email, title, subtitle, children, action, sidebarNav }: {
  email: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** The primary action for this screen, beside the title. */
  action?: React.ReactNode;
  /**
   * Institution-scoped navigation, rendered below the platform-wide links
   * rather than instead of them -- Institutions and Platform admins stay one
   * click away the same way OnyxShell's own sidebar never hides the way back
   * out. Passed by the tenant layout when a tenant is open; absent everywhere
   * else. See onyx-platform-tenant-nav.tsx for what fills this in.
   */
  sidebarNav?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 flex h-[60px] items-center gap-3 border-b border-line
                         bg-white/90 px-4 backdrop-blur lg:px-7">
        <Link href="/onyx/platform" aria-label="Onyx platform console, home"
          className="flex min-h-[44px] items-center gap-2.5">
          <OnyxMark className="h-7 w-auto" />
          <span className="text-[15px] font-bold tracking-tight">Onyx</span>
        </Link>
        {/* Said out loud, in the one place it cannot be missed. Every other
            screen in this product acts on one institution; this one acts on
            all of them. */}
        <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold uppercase
                         tracking-[.08em] text-white">
          Platform
        </span>
        <span className="flex-1" />
        <span className="hidden truncate text-xs text-muted sm:block" title={email}>{email}</span>
      </header>

      <div className="grid gap-7 px-4 pb-16 pt-5 lg:grid-cols-[216px_minmax(0,1fr)]
                      lg:items-start lg:px-7 lg:pt-7">
        <aside className="lg:sticky lg:top-[84px]">
          <div className="rounded-2xl border border-line bg-white p-3.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[.09em] text-muted">
              Operator
            </div>
            <div className="mt-0.5 truncate text-sm font-bold" title={email}>{email}</div>
            <div className="text-xs text-muted">Every institution</div>
          </div>

          <PlatformNavLinks />

          {sidebarNav}

          <div className="mt-4 rounded-2xl border border-line bg-white p-3">
            <PlatformSignOut />
          </div>
        </aside>

        <main id="main" tabIndex={-1} className="min-w-0">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
            </div>
            {action}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

