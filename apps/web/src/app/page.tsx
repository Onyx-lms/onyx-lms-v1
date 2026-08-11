import Link from 'next/link';
import { apiSafe, type SiteSettings } from '@/lib/api';

export const revalidate = 60;

/**
 * The front door.
 *
 * This used to be the storefront's home page -- a category grid, six courses, a
 * testimonial wall and three blog posts -- which made the first thing a visitor
 * met a marketing site for a product that is no longer the point. Onyx is what
 * this deployment is for, so the page now does one job: say what this is and
 * offer the way in.
 *
 * The storefront is NOT gone. Its pages, its catalogue and its checkout are all
 * still there and still reachable from the header nav and the link below; what
 * changed is which door is the obvious one. Everything removed from here still
 * exists at /courses, /blogs and the rest.
 *
 * Settings still drive the title and strapline rather than being hardcoded,
 * because the institution's own branding is configurable and a hardcoded name
 * here would quietly override it.
 */
export default async function HomePage() {
  const settings = await apiSafe<SiteSettings>('/api/settings');

  return (
    // No bottom border, and the gradient ends in the page's own white: with the
    // sections gone there is nothing below it, and a rule across an empty page
    // draws a line under nothing.
    <section className="bg-gradient-to-b from-brand-50 to-white">
      <div className="container-page flex min-h-[72vh] flex-col items-center justify-center
                      py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
          {settings?.system_title ?? 'Onyx LMS'}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          {settings?.meta_description
            ?? 'From attendance to employability — one LMS built around student outcomes.'}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {/* Straight to the institutional sign-in, not via /login: one
              redirect fewer, and the destination is visible on hover. */}
          <Link href="/onyx/login" className="btn-primary">Sign in</Link>
          <Link href="/courses" className="btn-ghost">Browse courses</Link>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Institutions are set up by the Onyx platform team.
        </p>
      </div>
    </section>
  );
}
