import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { OnyxLoginForm } from '@/components/onyx-auth-forms';
import { OnyxBrand } from '@/components/onyx-brand';
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
 * The mark is centred and the product is named in full, because someone
 * arriving from an emailed link needs to know whose sign-in page this is
 * before they type a password into it. The form itself -- its labels, its
 * error announcement and the request it makes -- is `OnyxLoginForm`, and is
 * untouched by this page.
 */
export default async function OnyxLoginPage() {
  if (await getOnyxSession()) redirect('/onyx/dashboard');

  return (
    // A plain div, not a <main>: the Onyx root layout already wraps every page
    // in `<main id="main">`, which is what the skip link targets. A second one
    // here would be a duplicate landmark and a duplicate id.
    <div className="mx-auto w-full max-w-[412px] px-4 pb-10 pt-12">
      <Card className="p-6 sm:p-7">
        <div className="mb-4 flex justify-center">
          <OnyxBrand />
        </div>

        <h1 className="text-center text-[22px] font-extrabold tracking-tight">
          Sign in to Onyx
        </h1>
        <p className="mt-1.5 text-center text-sm text-muted">
          Your account works across every institution you belong to.
        </p>

        <div className="mt-5">
          <OnyxLoginForm />
        </div>

        <hr className="my-5 border-line" />

        {/* The one thing about this product that is not obvious from the form:
            the account is not owned by an institution. Said here rather than in
            a help article, because the person who needs it is the one holding
            two invitations and wondering which login to use. */}
        <div className="flex items-start gap-2.5 text-[13px] text-muted">
          <Icon name="building" className="mt-0.5 h-4 w-4" />
          <p className="min-w-0 flex-1">
            One account, every institution. If you belong to more than one, you choose
            which after signing in &mdash; and you can switch at any time.
          </p>
        </div>
      </Card>

      {/* No "start a new institution" link any more: institutions are created
          by the platform team, from the platform console, so inviting somebody
          to self-serve here would only lead them to a page explaining that
          they cannot. */}
      <p className="mt-4 text-center text-sm text-muted">
        Institutions are set up by the Onyx platform team.
      </p>
    </div>
  );
}
