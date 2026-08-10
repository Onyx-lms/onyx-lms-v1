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
  admin: 'Administrator',
};

const STUDENT: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
];

const FACULTY: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
  { href: '/onyx/programs', label: 'Programmes' },
  { href: '/onyx/people', label: 'People' },
];

// Examinations and placement get the catalog but not the roster: neither role
// has business in who is enrolled where until O04 and O05 give them one.
const EXAMS: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
];

const PLACEMENT: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
];

const ADMIN: OnyxNavItem[] = [
  { href: '/onyx/dashboard', label: 'Dashboard' },
  { href: '/onyx/courses', label: 'Courses' },
  { href: '/onyx/practice', label: 'Practice' },
  { href: '/onyx/workspaces', label: 'Workspaces' },
  { href: '/onyx/programs', label: 'Programmes' },
  { href: '/onyx/people', label: 'People' },
  { href: '/onyx/audit', label: 'Audit log' },
];

const NAV: Record<Role, OnyxNavItem[]> = {
  student: STUDENT,
  faculty: FACULTY,
  exams: EXAMS,
  placement: PLACEMENT,
  admin: ADMIN,
};

export function navFor(role: Role): OnyxNavItem[] {
  return NAV[role] ?? STUDENT;
}
