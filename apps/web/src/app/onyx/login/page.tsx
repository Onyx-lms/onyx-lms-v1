import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { OnyxLoginForm } from '@/components/onyx-auth-forms';
import { OnyxMark } from '@/components/onyx-brand';
import { Card, Icon } from '@/components/onyx-ui';
import { getOnyxSession } from '@/lib/onyx-session';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * F-06 -- signing in.
 *
 * No shell at all: no sidebar, no tab bar, no header. There is nothing to
 * navigate to before you are signed in, and every piece of chrome on an auth
 * page is another thing to look at instead of the two fields.
 *
 * Two doors share this product, and they are one path segment apart:
 * /onyx/login is an institution's and /onyx/platform/login is the operators'.
 * So each card is topped by a band that names which one you are at -- teal and
 * "Institution" here, ink and "Platform" there, echoing the badge the console
 * already wears in its own header. Somebody arriving from an emailed link
 * should not have to read the URL to know whose password they are typing.
 *
 * The form itself -- its labels, its error announcement, the request it makes
 * and the cookie that comes back -- is `OnyxLoginForm`, and is untouched by
 * this page. Everything here is the surface it sits on.
 */
export default async function OnyxLoginPage() {
  if (await getOnyxSession()) redirect('/onyx/dashboard');

  return (
    // A plain div, not a <main>: the Onyx root layout already wraps every page
    // in `<main id="main">`, which is what the skip link targets. A second one
    // here would be a duplicate landmark and a duplicate id.
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Card className="overflow-hidden shadow-lift">
          {/* The band carries the mark, the door and the promise, so the white
              half below is nothing but the two fields and the button. */}
          <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-5 text-white
                          sm:px-7">
            <div className="flex flex-wrap items-center gap-2.5">
              <OnyxMark className="h-7 w-auto" />
              <span className="text-[15px] font-bold tracking-tight">Onyx LMS</span>
              <span className="ml-auto rounded-full border border-white/25 bg-white/10 px-2.5
                               py-1 text-[10.5px] font-bold uppercase tracking-[.08em]">
                Institution
              </span>
            </div>
            <h1 className="mt-4 text-[21px] font-extrabold leading-snug tracking-tight">
              Sign in to Onyx
            </h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-white/80">
              Your account works across every institution you belong to.
            </p>
          </div>

          <div className="p-5 sm:p-7">
            <OnyxLoginForm />

            <hr className="my-5 border-line" />

            {/* The one thing about this product that is not obvious from the
                form: the account is not owned by an institution. Said here
                rather than in a help article, because the person who needs it
                is the one holding two invitations and wondering which login to
                use. */}
            <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
              <span className="text-brand-600">
                <Icon name="building" className="mt-0.5 h-4 w-4" />
              </span>
              <p className="min-w-0 flex-1">
                One account, every institution. If you belong to more than one, you choose
                which after signing in &mdash; and you can switch at any time.
              </p>
            </div>
          </div>
        </Card>

        {/* No "start a new institution" link any more: institutions are created
            by the platform team, from the platform console, so inviting somebody
            to self-serve here would only lead them to a page explaining that
            they cannot. */}
        <p className="mt-4 text-center text-[13px] text-muted">
          Institutions are set up by the Onyx platform team.
        </p>
      </div>
    </div>
  );
}
