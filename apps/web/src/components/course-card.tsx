import Link from 'next/link';
import type { CourseCard as Course } from '@/lib/api';
import { coursePrice } from '@/lib/format';

export function CourseCard({ course, currencyPosition }: {
  course: Course;
  currencyPosition: string | null;
}) {
  const price = coursePrice(course, currencyPosition);
  return (
    <article className="card flex flex-col">
      <Link href={`/course/${course.slug}`} className="block">
        <div className="aspect-video w-full bg-gradient-to-br from-brand-50 to-slate-100">
          {course.thumbnail && (
            // Stored paths are legacy Laravel values; the API resolves them.
            <img
              src={course.thumbnail}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          {course.level && (
            <span className="chip border-brand-100 bg-brand-50 text-brand-700">{course.level}</span>
          )}
          {course.language && (
            <span className="chip border-slate-200 bg-slate-50 text-slate-600">{course.language}</span>
          )}
        </div>

        <h3 className="font-semibold leading-snug">
          <Link href={`/course/${course.slug}`} className="hover:text-brand-600">
            {course.title}
          </Link>
        </h3>

        {course.short_description && (
          <p className="line-clamp-2 text-sm text-slate-600">{course.short_description}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">{course.instructor_name}</span>
          <span className="text-sm font-semibold text-brand-700">
            {price.was && <s className="mr-1 font-normal text-slate-400">{price.was}</s>}
            {price.label}
          </span>
        </div>
      </div>
    </article>
  );
}
