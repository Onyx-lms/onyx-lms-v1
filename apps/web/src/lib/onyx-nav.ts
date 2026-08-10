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
  { href: '/onyx/people', label: 'People' },
  { href: '/onyx/audit', label: 'Audit log' },
];

const NAV: Record<Role, OnyxNavItem[]> = {
  student: STUDENT,
  faculty: FACULTY,
  exams: EXAMS,
  employer: EMPLOYER,
  placement: PLACEMENT,
  admin: ADMIN,
};

export function navFor(role: Role): OnyxNavItem[] {
  return NAV[role] ?? STUDENT;
}
