import Link from 'next/link';
import { apiSafe, type CategoryNode, type CourseCard as Course, type Paginated, type SiteSettings } from '@/lib/api';
import { CourseCard } from '@/components/course-card';
import { BlogCard, type BlogPost } from '@/components/blog-card';

interface Testimonial {
  id: number; rating: number; review: string | null;
  user?: { id: number; name: string | null } | null;
}

export const revalidate = 60;

export default async function HomePage() {
  const [settings, categories, courses, testimonials, posts] = await Promise.all([
    apiSafe<SiteSettings>('/api/settings'),
    apiSafe<CategoryNode[]>('/api/categories/top?limit=8'),
    apiSafe<Paginated<Course>>('/api/courses?per_page=6'),
    // R-03 / R-05. Both return null when empty or switched off, and the
    // sections below simply do not render -- no empty shells on the home page.
    apiSafe<Testimonial[]>('/api/testimonials'),
    apiSafe<Paginated<BlogPost>>('/api/blogs?per_page=3'),
  ]);

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="container-page py-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            {settings?.system_title ?? 'Onyx LMS'}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">
            {settings?.meta_description ?? 'Learn from expert instructors with comprehensive online courses.'}
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/courses" className="btn-primary">Browse courses</Link>
            <Link href="/instructors" className="btn-ghost">Meet the instructors</Link>
          </div>
        </div>
      </section>

      {(categories?.length ?? 0) > 0 && (
        <section className="container-page py-12">
          <h2 className="text-xl font-semibold">Browse by category</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories!.map((c) => (
              <Link key={c.id} href={`/courses?category=${c.slug}`} className="card p-4">
                <div className="font-medium">{c.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {c.course_count} {c.course_count === 1 ? 'course' : 'courses'}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container-page pb-14">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Latest courses</h2>
          <Link href="/courses" className="text-sm text-brand-600 hover:underline">View all</Link>
        </div>
        {courses && courses.data.length > 0 ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.data.map((c) => (
              <CourseCard key={c.id} course={c} currencyPosition={settings?.currency_position ?? 'left'} />
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-slate-500">No published courses yet.</p>
        )}
      </section>

      {(testimonials ?? []).length > 0 && (
        <section className="border-t border-slate-200 bg-slate-50">
          <div className="container-page py-12">
            <h2 className="text-xl font-semibold">What our learners say</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(testimonials ?? []).map((t) => (
                <figure key={t.id} className="card p-5">
                  <blockquote className="text-sm leading-relaxed text-slate-700">
                    &ldquo;{t.review}&rdquo;
                  </blockquote>
                  <figcaption className="mt-4 text-xs text-slate-500">
                    {t.user?.name ?? 'A learner'} &middot; {t.rating} / 5
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {posts && posts.data.length > 0 && (
        <section className="container-page py-12">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-semibold">From the blog</h2>
            <Link href="/blogs" className="text-sm text-brand-600 hover:underline">Read more</Link>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.data.map((p) => <BlogCard key={p.id} post={p} />)}
          </div>
        </section>
      )}
    </>
  );
}
