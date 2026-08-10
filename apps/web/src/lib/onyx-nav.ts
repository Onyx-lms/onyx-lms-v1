import type { Role } from './onyx-session';
import type { OnyxNavItem } from '@/components/onyx-shell';

/**
 * F-07 -- role-aware navigation.
 *
 * Five roles, five different jobs. Rather than one menu with items disabled,
 * each role gets the menu for its own work; the API enforces the same
 * boundaries, so a hidden link is a courtesy and not the control.
 *
 * This module is imported by client components, so it must stay free of
 * next/headers -- which is why the labels live here and not in onyx-session.
 */
export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  faculty: 'Faculty',
  exams: 'Examinations',
  placement: 'Placement',
  employer: 'Employer',
  admin: 'Administrator',
  guardian: 'Parent or guardian',
};

const STUDENT: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
  { href: '/onyx/assessments', label: 'Assessments' },
  { href: '/onyx/contests', label: 'Contests' },
  { href: '/onyx/jobs', label: 'Jobs' },
  { href: '/onyx/interviews', label: 'Interviews' },
  { href: '/onyx/timetable', label: 'Timetable' },
  { href: '/onyx/results', label: 'Results' },
  { href: '/onyx/fees', label: 'Fees' },
  { href: '/onyx/support', label: 'Help' },
  { href: '/onyx/profile', label: 'Your profile' },
];

const FACULTY: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
  { href: '/onyx/assessments', label: 'Assessments' },
  { href: '/onyx/invigilate', label: 'Invigilate' },
  { href: '/onyx/programs', label: 'Programmes' },
  { href: '/onyx/timetable', label: 'Timetable' },
  { href: '/onyx/support', label: 'Mentor queue' },
  { href: '/onyx/people', label: 'People' },
];

// Examinations runs papers: it invigilates, marks and publishes results without
// teaching a course. Placement still has no work of its own until O05.
const EXAMS: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
  { href: '/onyx/assessments', label: 'Assessments' },
  { href: '/onyx/invigilate', label: 'Invigilate' },
  { href: '/onyx/exams', label: 'Examinations' },
  { href: '/onyx/timetable', label: 'Timetable' },
];

// Placement is the role O05 gives work to: employers, posts, drives and the
// employability profiles behind them.
const PLACEMENT: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/placement', label: 'Placement' },
  { href: '/onyx/jobs', label: 'Jobs' },
  { href: '/onyx/contests', label: 'Contests' },
  { href: '/onyx/interviews', label: 'Interviews' },
];

/**
 * An employer is an outsider with an account. They get their own posts and the
 * interviews they are conducting, and nothing that belongs to the institution.
 */
const EMPLOYER: OnyxNavItem[] = [
  { href: '/onyx/jobs', label: 'Your posts' },
  { href: '/onyx/interviews', label: 'Interviews' },
];

const ADMIN: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
  { href: '/onyx/assessments', label: 'Assessments' },
  { href: '/onyx/invigilate', label: 'Invigilate' },
  { href: '/onyx/programs', label: 'Programmes' },
  { href: '/onyx/timetable', label: 'Timetable' },
  { href: '/onyx/exams', label: 'Examinations' },
  { href: '/onyx/finance', label: 'Fees' },
  { href: '/onyx/support', label: 'Mentor queue' },
  { href: '/onyx/people', label: 'People' },
  { href: '/onyx/audit', label: 'Audit log' },
];

/**
 * A guardian has one page.
 *
 * Everything they can see is derived from links other people control, so there
 * is nothing else to navigate to -- no courses of their own, no profile, no
 * catalogue. A menu with items they cannot use would be worse than a short one.
 */
const GUARDIAN: OnyxNavItem[] = [
  { href: '/onyx/family', label: 'Your family' },
];

const NAV: Record<Role, OnyxNavItem[]> = {
  student: STUDENT,
  faculty: FACULTY,
  exams: EXAMS,
  employer: EMPLOYER,
  placement: PLACEMENT,
  admin: ADMIN,
  guardian: GUARDIAN,
};

export function navFor(role: Role): OnyxNavItem[] {
  return NAV[role] ?? STUDENT;
}
