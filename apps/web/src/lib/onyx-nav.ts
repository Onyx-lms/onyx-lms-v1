import type { Role } from './onyx-session';
import type { IconName } from '@/components/onyx-ui';

/**
 * F-07 -- role-aware navigation.
 *
 * Seven roles, seven different jobs. Rather than one menu with items
 * disabled, each role gets the menu for its own work; the API enforces the
 * same boundaries, so a hidden link is a courtesy and not the control.
 *
 * Two things changed when the design was reworked:
 *
 *   * **Groups.** A flat list of thirteen links is what the admin menu had
 *     become, and it is the thing that most made the product read as an
 *     unfinished internal tool rather than an institutional platform. Every
 *     enterprise console worth copying groups its sidebar; these are grouped
 *     by the job being done, not by the sprint that added them.
 *   * **Tabs.** `tabsFor` is the phone's bottom bar -- at most five
 *     destinations, chosen as the ones a person opens daily. Everything else
 *     stays one tap away behind the header menu, which is what stops a phone
 *     having to scroll past the whole menu to reach any content.
 *
 * This module is imported by client components, so it must stay free of
 * next/headers -- which is why the labels live here and not in onyx-session.
 */

export interface OnyxNavItem { href: string; label: string; icon: IconName }
export interface OnyxNavGroup { label?: string; items: OnyxNavItem[] }

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  faculty: 'Faculty',
  exams: 'Examinations',
  placement: 'Placement',
  employer: 'Employer',
  admin: 'Administrator',
  guardian: 'Parent or guardian',
};

const I = {
  dashboard: { href: '/onyx/dashboard', label: 'Dashboard', icon: 'home' },
  courses:   { href: '/onyx/courses', label: 'Courses', icon: 'book' },
  practice:  { href: '/onyx/practice', label: 'Practice', icon: 'code' },
  spaces:    { href: '/onyx/workspaces', label: 'Workspaces', icon: 'layers' },
  assess:    { href: '/onyx/assessments', label: 'Assessments', icon: 'edit' },
  results:   { href: '/onyx/results', label: 'Results', icon: 'award' },
  contests:  { href: '/onyx/contests', label: 'Contests', icon: 'trophy' },
  timetable: { href: '/onyx/timetable', label: 'Timetable', icon: 'calendar' },
  fees:      { href: '/onyx/fees', label: 'Fees', icon: 'wallet' },
  finance:   { href: '/onyx/finance', label: 'Finance', icon: 'wallet' },
  support:   { href: '/onyx/support', label: 'Help', icon: 'help' },
  mentor:    { href: '/onyx/support', label: 'Mentor queue', icon: 'help' },
  jobs:      { href: '/onyx/jobs', label: 'Jobs', icon: 'briefcase' },
  posts:     { href: '/onyx/jobs', label: 'Your posts', icon: 'briefcase' },
  interviews:{ href: '/onyx/interviews', label: 'Interviews', icon: 'mic' },
  profile:   { href: '/onyx/profile', label: 'Your profile', icon: 'user' },
  people:    { href: '/onyx/people', label: 'People', icon: 'users' },
  programs:  { href: '/onyx/programs', label: 'Programmes', icon: 'building' },
  exams:     { href: '/onyx/exams', label: 'Examinations', icon: 'award' },
  invigilate:{ href: '/onyx/invigilate', label: 'Invigilate', icon: 'shield' },
  placement: { href: '/onyx/placement', label: 'Placement', icon: 'chart' },
  audit:     { href: '/onyx/audit', label: 'Audit log', icon: 'flag' },
  family:    { href: '/onyx/family', label: 'Your family', icon: 'users' },
  certs:     { href: '/onyx/certificates', label: 'Certificates', icon: 'award' },
  allocate:  { href: '/onyx/allocations', label: 'Teaching load', icon: 'chart' },
} satisfies Record<string, OnyxNavItem>;

const NAV: Record<Role, OnyxNavGroup[]> = {
  student: [
    { items: [I.dashboard, I.courses, I.practice, I.spaces] },
    { label: 'Assessment', items: [I.assess, I.results, I.contests] },
    { label: 'Campus', items: [I.timetable, I.fees, I.support] },
    { label: 'Career', items: [I.jobs, I.interviews, I.profile] },
  ],
  faculty: [
    { items: [I.dashboard, I.courses, I.practice, I.spaces] },
    { label: 'Assessment', items: [I.assess, I.invigilate] },
    { label: 'Teaching', items: [I.programs, I.timetable, I.allocate, I.people] },
    { label: 'Support', items: [I.mentor] },
  ],
  exams: [
    { items: [I.dashboard, I.courses] },
    { label: 'Examinations', items: [I.assess, I.invigilate, I.exams, I.timetable, I.certs] },
    { label: 'Practice', items: [I.practice, I.spaces] },
  ],
  placement: [
    { items: [I.dashboard, I.courses] },
    { label: 'Placement', items: [I.placement, I.jobs, I.interviews, I.contests, I.certs] },
  ],
  // An employer is an outsider with an account: their own posts and the
  // interviews they are conducting, and nothing that belongs to the institution.
  employer: [{ items: [I.posts, I.interviews] }],
  // A guardian has exactly one page -- everything they see is derived from
  // links other people control, so there is nowhere else to navigate to.
  guardian: [{ items: [I.family] }],
  admin: [
    { items: [I.dashboard, I.courses, I.practice, I.spaces] },
    // Invigilation and placement are the administrator's too: ASS-03 lets them
    // watch a sitting and CAR-04 makes them keeper of the employer records.
    // Both were reachable only by typing the URL until this line existed.
    { label: 'Assessment', items: [I.assess, I.invigilate, I.exams, I.contests, I.certs] },
    { label: 'Campus', items: [I.programs, I.timetable, I.allocate, I.people, I.finance] },
    { label: 'Career', items: [I.placement, I.jobs] },
    { label: 'Operations', items: [I.mentor, I.audit] },
  ],
};

export function navFor(role: Role): OnyxNavGroup[] {
  return NAV[role] ?? NAV.student;
}

/**
 * The phone's bottom bar. Five at most -- past that the targets get too
 * narrow for a thumb, and the sixth item is never the one anyone wanted.
 */
const TABS: Record<Role, OnyxNavItem[]> = {
  student:   [I.dashboard, I.courses, I.practice, I.results, I.timetable],
  faculty:   [I.dashboard, I.courses, I.assess, I.people, I.timetable],
  exams:     [I.dashboard, I.exams, I.assess, I.invigilate, I.timetable],
  placement: [I.dashboard, I.placement, I.jobs, I.interviews, I.contests],
  employer:  [I.posts, I.interviews],
  guardian:  [I.family],
  admin:     [I.dashboard, I.courses, I.people, I.finance, I.timetable],
};

export function tabsFor(role: Role): OnyxNavItem[] {
  return (TABS[role] ?? TABS.student).slice(0, 5);
}
