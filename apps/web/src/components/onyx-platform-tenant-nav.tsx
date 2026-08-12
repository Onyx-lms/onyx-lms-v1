'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The sub-nav for one open institution -- Overview, Students, Faculty,
 * Courses... each its own route now, not a scroll position on one long page.
 * Needs the current path to mark which tab is open, which is the one reason
 * this is a client component rather than folded into the server-rendered
 * layout around it.
 */
const TABS = [
  { seg: '', label: 'Overview' },
  { seg: 'students', label: 'Students' },
  { seg: 'faculty', label: 'Faculty' },
  { seg: 'courses', label: 'Courses' },
  { seg: 'assignments', label: 'Assignments' },
  { seg: 'examinations', label: 'Examinations' },
  { seg: 'assessments', label: 'Assessments' },
  { seg: 'grades', label: 'Grades' },
  { seg: 'fees', label: 'Fees' },
] as const;

export function TenantSubnav({ tenantId }: { tenantId: number }) {
  const pathname = usePathname();
  const base = '/onyx/platform/tenants/' + tenantId;

  return (
    <nav aria-label="Institution sections"
      className="flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-line
                 bg-white p-1.5">
      {TABS.map((t) => {
        const href = t.seg ? base + '/' + t.seg : base;
        const active = pathname === href;
        return (
          <Link
            key={t.seg}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={
              'shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-bold whitespace-nowrap transition ' +
              (active ? 'bg-ink text-white' : 'text-slate-700 hover:bg-brand-50 hover:text-brand-700')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
