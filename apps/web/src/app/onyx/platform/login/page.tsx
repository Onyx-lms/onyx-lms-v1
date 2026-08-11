import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { OnyxMark } from '@/components/onyx-brand';
import { PlatformLoginForm } from '@/components/onyx-platform-forms';
import { Card, Icon } from '@/components/onyx-ui';
import { getPlatformSession } from '@/lib/onyx-platform-session';

export const metadata: Metadata = { title: 'Platform sign in' };

/**
 * A separate door from /onyx/login on purpose. A platform admin is not
 * signing in to an institution -- there is no tenant picker here, and no
 * tenant to land in. See onyx-platform-session.ts for why the two sessions
 * do not share a cookie or a claims shape.
 *
 * Two doors one path segment apart is a thing an operator can get wrong at a
 * glance, so this one does not merely differ, it declares itself: ink rather
 * than teal, and the same `PLATFORM` badge the console wears in its own
 * header. The consequence of confusing them is not symmetrical -- every other
 * screen in this product acts on one institution and this one acts on all of
 * them -- which is why the difference is stated in words as well as colour.
 *
 * `PlatformLoginForm` is untouched: same fields, same error announcement, same
 * POST to /api/onyx-platform/login and the same platform cookie back.
 */
export default async function OnyxPlatformLoginPage() {
  if (await getPlatformSession()) redirect('/onyx/platform');

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Card className="overflow-hidden shadow-lift">
          <div className="bg-ink px-5 py-5 text-white sm:px-7">
            <div className="flex flex-wrap items-center gap-2.5">
              <OnyxMark className="h-7 w-auto" />
              <span className="text-[15px] font-bold tracking-tight">Onyx</span>
              {/* The console's own badge, on the door to it. */}
              <span className="ml-auto rounded-full bg-white px-2.5 py-1 text-[10.5px] font-bold
                               uppercase tracking-[.08em] text-ink">
                Platform
              </span>
            </div>
            <h1 className="mt-4 text-[21px] font-extrabold leading-snug tracking-tight">
              Platform console
            </h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-white/80">
              For operators, not for any one institution.
            </p>
          </div>

          <div className="p-5 sm:p-7">
            <PlatformLoginForm />

            <hr className="my-5 border-line" />

            {/* Said before the password rather than after the mistake. */}
            <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
              <span className="text-ink">
                <Icon name="shield" className="mt-0.5 h-4 w-4" />
              </span>
              <p className="min-w-0 flex-1">
                This session belongs to no institution and can act on every one of them. If you
                meant to sign in to your own, the door is{' '}
                <span className="font-semibold text-ink">/onyx/login</span>.
              </p>
            </div>
          </div>
        </Card>

        <p className="mt-4 text-center text-[13px] text-muted">
          Every action taken here is written to the platform audit log.
        </p>
      </div>
    </div>
  );
}
