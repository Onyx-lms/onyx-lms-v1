/**
 * The platform layer -- the operator who sits above every institution.
 *
 * Not a tenant role, and not one of the seven in `Role`. A platform admin is
 * not a member of any institution by virtue of holding this; they can create
 * one, look at the shape of any of them, and suspend one that has stopped
 * paying or started misbehaving, all without a tenant token that would make
 * them subject to (or a hole in) that institution's own RLS boundary.
 *
 * Every read and write in this file goes through the service-role client --
 * the same one tenant creation already uses -- because there is no tenant
 * claim for RLS to check a platform admin's token against. See 0009_platform
 * for why a permissive policy here would be the wrong shape of trust.
 */
import type { Role } from '@onyx/types';
import type { OnyxDb } from './db.ts';
import { HttpError } from '../http/errors.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { slugify } from '../authoring/slug.ts';

const TENANT_COLUMNS = 'id, name, slug, status, plan, created_at, updated_at';
const ADMIN_COLUMNS = 'id, user_id, granted_by, created_at';

/**
 * Caps.
 *
 * An operator opening an institution should get a page, not a table scan. Every
 * list below is bounded, and every bounded list reports whether it hit the
 * bound so the screen can say "showing the first N" rather than quietly lying
 * about how much there is. ROW_CAP bounds what an operator reads directly;
 * SCAN_CAP bounds the one-query-then-tally passes used to attach counts to
 * those rows (a per-row count query would be N round trips).
 */
const ROW_CAP = 200;
const SCAN_CAP = 5000;

const num = (v: unknown): number => Number(v ?? 0);
const clampLimit = (v: number | undefined, fallback = ROW_CAP) =>
  Math.min(Math.max(Number.isFinite(v) && v! > 0 ? Math.trunc(v!) : fallback, 1), ROW_CAP);

/** Mean to one decimal, or null when there is nothing to average. */
function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

interface PersonRow {
  user_id: number; name: string; email: string; role: string;
  membership_status: number; account_status: number; joined_at: string;
  batch: { id: number; name: string; code: string } | null;
  programme: { id: number; name: string; code: string } | null;
  enrollment_count: number; teaching_count: number;
}

export class PlatformService {
  #db: OnyxDb;
  constructor(db: OnyxDb) { this.#db = db; }

  // -------------------------------------------------------------------------
  // Who gets in
  // -------------------------------------------------------------------------

  /**
   * Signing in as a platform admin uses the same email and password as any
   * other Onyx account -- there is one identity per person, same as
   * tenancy.service.ts's authenticate(). What differs is what it checks
   * afterwards: not "do you belong to an institution" but "are you listed in
   * onyx_platform_admins", and what it issues: a token with no tenant_id.
   */
  async authenticate(email: string, password: string) {
    const { data: user } = await this.#db.from('onyx_users')
      .select('id, email, name, password, status')
      .eq('email', email.trim().toLowerCase()).maybeSingle();
    // The same message either way: which emails exist, and which of those are
    // platform admins, is not public.
    if (!user || !user.password) throw new HttpError(401, 'Those details do not match.');
    if (!(await verifyPassword(password, user.password))) {
      throw new HttpError(401, 'Those details do not match.');
    }
    if (user.status !== 1) throw new HttpError(403, 'That account is not active.');

    const { data: grant } = await this.#db.from('onyx_platform_admins')
      .select(ADMIN_COLUMNS).eq('user_id', Number(user.id)).maybeSingle();
    if (!grant) throw new HttpError(401, 'Those details do not match.');

    return { user: { id: user.id, email: user.email, name: user.name } };
  }

  async isPlatformAdmin(userId: number): Promise<boolean> {
    const { data } = await this.#db.from('onyx_platform_admins')
      .select('id').eq('user_id', userId).maybeSingle();
    return Boolean(data);
  }

  async admins() {
    const { data } = await this.#db.from('onyx_platform_admins')
      .select(ADMIN_COLUMNS).order('created_at', { ascending: true });
    const rows = data ?? [];
    if (!rows.length) return [];
    const { data: people } = await this.#db.from('onyx_users').select('id, name, email')
      .in('id', rows.map((r) => Number(r.user_id)));
    const byId = new Map((people ?? []).map((p) => [Number(p.id), p]));
    return rows.map((r) => ({ ...r, user: byId.get(Number(r.user_id)) ?? null }));
  }

  /**
   * Grant platform admin to an existing account, or a brand new one.
   *
   * Bootstrapping the very first platform admin -- when this table is empty
   * and nobody holds a token that could pass requirePlatformAdmin() to call
   * this -- is deliberately NOT this method's job. That happens once, from
   * the machine, via tools/onyx/grant-platform-admin.mjs, which writes the
   * row directly with the service-role connection this same class uses. This
   * method is for the second admin onward, granted by the first.
   */
  async grant(email: string, name: string, password: string | null, grantedBy: number | null) {
    const normalised = email.trim().toLowerCase();
    const { data: existing } = await this.#db.from('onyx_users')
      .select('id, name').eq('email', normalised).maybeSingle();

    let userId: number;
    if (existing) {
      userId = Number(existing.id);
    } else {
      if (!password) throw new HttpError(422, 'A new account needs a password.');
      const { data: created, error } = await this.#db.from('onyx_users').insert({
        email: normalised, name: name.trim(), password: await hashPassword(password), status: 1,
      }).select('id').maybeSingle();
      if (error || !created) {
        throw new HttpError(500, 'Could not create the account: ' + (error?.message ?? 'no row'));
      }
      userId = Number(created.id);
    }

    const { data, error } = await this.#db.from('onyx_platform_admins').insert({
      user_id: userId, granted_by: grantedBy,
    }).select(ADMIN_COLUMNS).maybeSingle();
    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        throw new HttpError(409, 'That person is already a platform admin.');
      }
      throw new HttpError(500, 'Could not grant platform admin: ' + error.message);
    }

    await this.#log(grantedBy, 'platform_admin.granted', 'platform_admin', Number(data!.id),
      null, { user_id: userId, email: normalised });
    return data;
  }

  async revoke(id: number, actorId: number | null) {
    const { data: row } = await this.#db.from('onyx_platform_admins')
      .select(ADMIN_COLUMNS).eq('id', id).maybeSingle();
    if (!row) throw new HttpError(404, 'No such platform admin.');

    // The last one is not removable through this path: a platform with nobody
    // able to sign in to it is not "more secure", it is unrecoverable short
    // of the same direct-database step bootstrapping used.
    const { data: all } = await this.#db.from('onyx_platform_admins').select('id');
    if ((all ?? []).length <= 1) {
      throw new HttpError(422, 'That is the last platform admin. Grant another one first.');
    }

    await this.#db.from('onyx_platform_admins').delete().eq('id', id);
    await this.#log(actorId, 'platform_admin.revoked', 'platform_admin', id,
      { user_id: row.user_id }, null);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Every institution
  // -------------------------------------------------------------------------

  async tenants() {
    const { data } = await this.#db.from('onyx_tenants')
      .select(TENANT_COLUMNS).order('created_at', { ascending: false });
    const rows = data ?? [];
    if (!rows.length) return [];

    // One count query per table rather than a join, because these tables
    // have no foreign key to lean on in a single request through PostgREST,
    // and this page is read by one operator at a time, not per learner.
    const { data: memberships } = await this.#db.from('onyx_memberships')
      .select('tenant_id').in('tenant_id', rows.map((t) => Number(t.id))).eq('status', 1);
    const counts = new Map<number, number>();
    for (const m of memberships ?? []) {
      const id = Number(m.tenant_id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return rows.map((t) => ({ ...t, member_count: counts.get(Number(t.id)) ?? 0 }));
  }

  /**
   * One institution's headline shape.
   *
   * The role breakdown was all this returned, which answers "how many people"
   * and nothing about whether the place is actually being used. The counts
   * added here are the cheap ones -- HEAD requests that come back as a number
   * from Postgres rather than rows over the wire -- so the drill-in page can
   * lead with what an operator actually wants to know before scrolling.
   */
  async tenant(id: number) {
    const { data } = await this.#db.from('onyx_tenants')
      .select(TENANT_COLUMNS).eq('id', id).maybeSingle();
    if (!data) throw new HttpError(404, 'No such institution.');

    const { data: memberships } = await this.#db.from('onyx_memberships')
      .select('role').eq('tenant_id', id).eq('status', 1);
    const byRole: Record<string, number> = {};
    for (const m of memberships ?? []) {
      byRole[String(m.role)] = (byRole[String(m.role)] ?? 0) + 1;
    }

    const head = { count: 'exact' as const, head: true };
    const [
      courses, assessments, assignments, enrollments,
      programs, batches, exams, examMarks, submissions, attempts,
    ] = await Promise.all([
      this.#db.from('onyx_courses').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_assessments').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_assignments').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_enrollments').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_programs').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_batches').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_exams').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_exam_marks').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_assignment_submissions').select('id', head).eq('tenant_id', id),
      this.#db.from('onyx_assessment_attempts').select('id', head).eq('tenant_id', id),
    ]);

    return {
      ...data,
      members_by_role: byRole,
      member_count: Object.values(byRole).reduce((sum, n) => sum + n, 0),
      counts: {
        courses: courses.count ?? 0,
        assessments: assessments.count ?? 0,
        assignments: assignments.count ?? 0,
        enrollments: enrollments.count ?? 0,
        programmes: programs.count ?? 0,
        batches: batches.count ?? 0,
        exams: exams.count ?? 0,
        exam_marks: examMarks.count ?? 0,
        submissions: submissions.count ?? 0,
        attempts: attempts.count ?? 0,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Looking inside one institution
  //
  // These three read a customer's own records -- their students, their marks --
  // from outside their tenancy. Three rules hold for all of them and are worth
  // stating once rather than three times:
  //
  //   1. Every query filters on tenant_id. There is no RLS underneath the
  //      service-role client to catch a forgotten one, so the filter IS the
  //      boundary. The one exception is onyx_users, which has no tenant_id by
  //      design (one identity per person, many memberships) -- so it is only
  //      ever read by an id list already derived from a tenant-filtered query.
  //   2. Every list is capped and says so, because "the operator's browser hung"
  //      is how a big customer finds out this page exists.
  //   3. Reading grades is audited. See tenantGrades().
  // -------------------------------------------------------------------------

  /** Cheap existence check -- 404 before doing eight more queries for nothing. */
  async #requireTenant(id: number) {
    const { data } = await this.#db.from('onyx_tenants')
      .select('id, name, slug').eq('id', id).maybeSingle();
    if (!data) throw new HttpError(404, 'No such institution.');
    return data;
  }

  /**
   * onyx_users is the one table here without a tenant_id, so it is never
   * queried by tenant -- only by a list of ids that a tenant-scoped query
   * produced. Passing ids from anywhere else would leak across institutions.
   */
  async #usersById(ids: number[]) {
    const out = new Map<number, { id: number; name: string; email: string; status: number }>();
    if (!ids.length) return out;
    const { data } = await this.#db.from('onyx_users')
      .select('id, name, email, status').in('id', ids);
    for (const u of data ?? []) {
      out.set(num(u.id), {
        id: num(u.id), name: String(u.name), email: String(u.email), status: num(u.status),
      });
    }
    return out;
  }

  /**
   * The institution's people: who is on the roll, what they are, and enough
   * context (batch, programme, how much they are enrolled in) to tell an active
   * student from a name that was imported once and never used.
   */
  async tenantPeople(id: number, opts: { role?: string; limit?: number } = {}) {
    const tenant = await this.#requireTenant(id);
    const limit = clampLimit(opts.limit);

    const scoped = this.#db.from('onyx_memberships')
      .select('id, user_id, role, status, created_at').eq('tenant_id', id);

    // limit + 1 so "there is more" is a fact, not a guess from a full page.
    const listing = opts.role ? scoped.eq('role', opts.role as Role) : scoped;
    const { data: rows } = await listing
      .order('role', { ascending: true }).order('id', { ascending: true })
      .limit(limit + 1);
    const page = (rows ?? []).slice(0, limit);
    const capped = (rows ?? []).length > limit;

    // The total counts the same set the page is a window onto -- with the role
    // filter applied -- so "showing 200 of 4,312" is about one comparable thing.
    const counting = this.#db.from('onyx_memberships')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', id);
    const { count: total } = await (opts.role
      ? counting.eq('role', opts.role as Role) : counting);

    const userIds = page.map((m) => num(m.user_id));
    const users = await this.#usersById(userIds);

    // Everything below is keyed on userIds, which came from a tenant-filtered
    // read, and is tenant-filtered again anyway.
    const [enrolQ, batchMemQ, facultyQ] = userIds.length ? await Promise.all([
      this.#db.from('onyx_enrollments').select('user_id, batch_id')
        .eq('tenant_id', id).eq('status', 1).in('user_id', userIds).limit(SCAN_CAP),
      this.#db.from('onyx_batch_members').select('user_id, batch_id')
        .eq('tenant_id', id).in('user_id', userIds).limit(SCAN_CAP),
      this.#db.from('onyx_course_faculty').select('user_id, course_id')
        .eq('tenant_id', id).in('user_id', userIds).limit(SCAN_CAP),
    ]) : [{ data: [] }, { data: [] }, { data: [] }];

    const enrolCount = new Map<number, number>();
    const batchOf = new Map<number, number>();
    for (const e of enrolQ.data ?? []) {
      const uid = num(e.user_id);
      enrolCount.set(uid, (enrolCount.get(uid) ?? 0) + 1);
      if (e.batch_id != null && !batchOf.has(uid)) batchOf.set(uid, num(e.batch_id));
    }
    // An explicit batch membership beats one inferred from an enrolment.
    for (const b of batchMemQ.data ?? []) batchOf.set(num(b.user_id), num(b.batch_id));
    const teachCount = new Map<number, number>();
    for (const f of facultyQ.data ?? []) {
      const uid = num(f.user_id);
      teachCount.set(uid, (teachCount.get(uid) ?? 0) + 1);
    }

    const batchIds = [...new Set(batchOf.values())];
    const { data: batchRows } = batchIds.length
      ? await this.#db.from('onyx_batches').select('id, name, code, program_id')
        .eq('tenant_id', id).in('id', batchIds)
      : { data: [] };
    const programIds = [...new Set((batchRows ?? [])
      .map((b) => num(b.program_id)).filter((n) => n > 0))];
    const { data: programRows } = programIds.length
      ? await this.#db.from('onyx_programs').select('id, name, code')
        .eq('tenant_id', id).in('id', programIds)
      : { data: [] };
    const programmes = new Map((programRows ?? []).map((p) => [num(p.id),
      { id: num(p.id), name: String(p.name), code: String(p.code) }]));
    const batches = new Map((batchRows ?? []).map((b) => [num(b.id), {
      batch: { id: num(b.id), name: String(b.name), code: String(b.code) },
      programme: programmes.get(num(b.program_id)) ?? null,
    }]));

    const people: PersonRow[] = page.map((m) => {
      const uid = num(m.user_id);
      const user = users.get(uid);
      const linked = batches.get(batchOf.get(uid) ?? -1) ?? null;
      return {
        user_id: uid,
        name: user?.name ?? 'Unknown',
        email: user?.email ?? '',
        role: String(m.role),
        membership_status: num(m.status),
        account_status: user?.status ?? 0,
        joined_at: String(m.created_at),
        batch: linked?.batch ?? null,
        programme: linked?.programme ?? null,
        enrollment_count: enrolCount.get(uid) ?? 0,
        teaching_count: teachCount.get(uid) ?? 0,
      };
    });

    const byRole: Record<string, number> = {};
    for (const p of people) byRole[p.role] = (byRole[p.role] ?? 0) + 1;

    return {
      tenant: { id: num(tenant.id), name: String(tenant.name), slug: String(tenant.slug) },
      role: opts.role ?? null,
      limit, capped, total: total ?? people.length,
      counts_by_role: byRole,
      people,
    };
  }

  /**
   * What the institution teaches and what it sets: courses with how many people
   * are on them, and the assignments and assessments hanging off those courses
   * with how much work has actually come back.
   */
  async tenantAcademics(id: number, opts: { limit?: number } = {}) {
    const tenant = await this.#requireTenant(id);
    const limit = clampLimit(opts.limit);

    const [courseQ, assignmentQ, assessmentQ] = await Promise.all([
      this.#db.from('onyx_courses')
        .select('id, code, title, credits, status, program_id, semester_id, self_enroll, created_at')
        .eq('tenant_id', id).order('code', { ascending: true }).limit(limit + 1),
      this.#db.from('onyx_assignments')
        .select('id, course_id, title, due_at, total_points, status, created_at')
        .eq('tenant_id', id).order('due_at', { ascending: false, nullsFirst: false })
        .limit(limit + 1),
      this.#db.from('onyx_assessments')
        // One literal, not a concatenation: supabase-js infers the row type
        // from the select string as a literal type, and `a + b` is just string.
        .select('id, course_id, title, opens_at, closes_at, status, pass_mark, duration_minutes, attempts_allowed, created_at')
        .eq('tenant_id', id).order('created_at', { ascending: false }).limit(limit + 1),
    ]);

    const courseRows = (courseQ.data ?? []).slice(0, limit);
    const assignmentRows = (assignmentQ.data ?? []).slice(0, limit);
    const assessmentRows = (assessmentQ.data ?? []).slice(0, limit);

    // Counts by one scan-and-tally per table rather than one query per row.
    const [enrolQ, facQ, subQ, attemptQ, progQ] = await Promise.all([
      this.#db.from('onyx_enrollments').select('course_id, status')
        .eq('tenant_id', id).limit(SCAN_CAP),
      this.#db.from('onyx_course_faculty').select('course_id, user_id')
        .eq('tenant_id', id).limit(SCAN_CAP),
      assignmentRows.length
        ? this.#db.from('onyx_assignment_submissions').select('assignment_id, status')
          .eq('tenant_id', id).in('assignment_id', assignmentRows.map((a) => num(a.id)))
          .limit(SCAN_CAP)
        : Promise.resolve({ data: [] }),
      assessmentRows.length
        ? this.#db.from('onyx_assessment_attempts').select('assessment_id, status, score')
          .eq('tenant_id', id).in('assessment_id', assessmentRows.map((a) => num(a.id)))
          .limit(SCAN_CAP)
        : Promise.resolve({ data: [] }),
      this.#db.from('onyx_programs').select('id, name, code').eq('tenant_id', id).limit(ROW_CAP),
    ]);

    const enrolBy = new Map<number, number>();
    for (const e of enrolQ.data ?? []) {
      if (num(e.status) !== 1) continue;
      const c = num(e.course_id);
      enrolBy.set(c, (enrolBy.get(c) ?? 0) + 1);
    }
    const facBy = new Map<number, number>();
    for (const f of facQ.data ?? []) {
      const c = num(f.course_id);
      facBy.set(c, (facBy.get(c) ?? 0) + 1);
    }
    const programmes = new Map((progQ.data ?? []).map((p) => [num(p.id), String(p.name)]));

    const courses = courseRows.map((c) => ({
      id: num(c.id),
      code: String(c.code),
      title: String(c.title),
      credits: num(c.credits),
      status: num(c.status),
      self_enroll: num(c.self_enroll) === 1,
      programme: c.program_id == null ? null : programmes.get(num(c.program_id)) ?? null,
      enrollment_count: enrolBy.get(num(c.id)) ?? 0,
      faculty_count: facBy.get(num(c.id)) ?? 0,
      created_at: String(c.created_at),
    }));
    const courseLabel = new Map(courses.map((c) => [c.id, { code: c.code, title: c.title }]));

    const subTotal = new Map<number, number>();
    const subGraded = new Map<number, number>();
    for (const s of subQ.data ?? []) {
      const a = num(s.assignment_id);
      subTotal.set(a, (subTotal.get(a) ?? 0) + 1);
      if (s.status === 'graded' || s.status === 'returned') {
        subGraded.set(a, (subGraded.get(a) ?? 0) + 1);
      }
    }
    const attTotal = new Map<number, number>();
    const attDone = new Map<number, number>();
    for (const a of attemptQ.data ?? []) {
      const k = num(a.assessment_id);
      attTotal.set(k, (attTotal.get(k) ?? 0) + 1);
      if (a.status !== 'in_progress') attDone.set(k, (attDone.get(k) ?? 0) + 1);
    }

    return {
      tenant: { id: num(tenant.id), name: String(tenant.name), slug: String(tenant.slug) },
      limit,
      capped: {
        courses: (courseQ.data ?? []).length > limit,
        assignments: (assignmentQ.data ?? []).length > limit,
        assessments: (assessmentQ.data ?? []).length > limit,
      },
      courses,
      assignments: assignmentRows.map((a) => ({
        id: num(a.id),
        title: String(a.title),
        course_id: num(a.course_id),
        course: courseLabel.get(num(a.course_id)) ?? null,
        due_at: a.due_at ? String(a.due_at) : null,
        total_points: num(a.total_points),
        status: String(a.status),
        submission_count: subTotal.get(num(a.id)) ?? 0,
        graded_count: subGraded.get(num(a.id)) ?? 0,
      })),
      assessments: assessmentRows.map((a) => ({
        id: num(a.id),
        title: String(a.title),
        course_id: a.course_id == null ? null : num(a.course_id),
        course: a.course_id == null ? null : courseLabel.get(num(a.course_id)) ?? null,
        opens_at: a.opens_at ? String(a.opens_at) : null,
        closes_at: a.closes_at ? String(a.closes_at) : null,
        status: String(a.status),
        pass_mark: a.pass_mark == null ? null : num(a.pass_mark),
        duration_minutes: num(a.duration_minutes),
        attempt_count: attTotal.get(num(a.id)) ?? 0,
        submitted_count: attDone.get(num(a.id)) ?? 0,
      })),
    };
  }

  /**
   * The institution's results, read from outside it.
   *
   * This is the most privileged read in the file. A platform admin has a real
   * reason to look -- a customer disputing a marks import, a moderation bug --
   * but "who looked at our students' marks, and when" is exactly the question
   * that institution is entitled to be able to ask afterwards. So unlike
   * tenantPeople() and tenantAcademics(), this one writes an audit row on the
   * way past, the same as grant()/revoke()/suspend() do for writes. An
   * unlogged read here would be indistinguishable from an exfiltration.
   */
  async tenantGrades(id: number, actorId: number | null, opts: { limit?: number } = {}) {
    const tenant = await this.#requireTenant(id);
    const limit = clampLimit(opts.limit);

    const [markQ, attemptQ] = await Promise.all([
      this.#db.from('onyx_exam_marks')
        .select('id, exam_id, user_id, raw_marks, moderation_delta, final_marks, grade, grade_points, status, published_at, created_at')
        .eq('tenant_id', id).order('created_at', { ascending: false }).limit(limit + 1),
      this.#db.from('onyx_assessment_attempts')
        .select('id, assessment_id, user_id, attempt, score, max_score, status, submitted_at')
        .eq('tenant_id', id).not('score', 'is', null)
        .order('submitted_at', { ascending: false, nullsFirst: false }).limit(limit + 1),
    ]);

    const markRows = (markQ.data ?? []).slice(0, limit);
    const attemptRows = (attemptQ.data ?? []).slice(0, limit);

    const examIds = [...new Set(markRows.map((m) => num(m.exam_id)))];
    const assessmentIds = [...new Set(attemptRows.map((a) => num(a.assessment_id)))];
    const [examQ, assessQ, gradeQ] = await Promise.all([
      examIds.length
        ? this.#db.from('onyx_exams')
          .select('id, title, course_id, max_marks, pass_marks, starts_at, status')
          .eq('tenant_id', id).in('id', examIds)
        : Promise.resolve({ data: [] }),
      assessmentIds.length
        ? this.#db.from('onyx_assessments').select('id, title, course_id, pass_mark')
          .eq('tenant_id', id).in('id', assessmentIds)
        : Promise.resolve({ data: [] }),
      attemptRows.length
        ? this.#db.from('onyx_assessment_grades').select('attempt_id, role, manual_score')
          .eq('tenant_id', id).in('attempt_id', attemptRows.map((a) => num(a.id)))
          .limit(SCAN_CAP)
        : Promise.resolve({ data: [] }),
    ]);

    const courseIds = [...new Set([
      ...(examQ.data ?? []).map((e) => num(e.course_id)),
      ...(assessQ.data ?? []).map((a) => (a.course_id == null ? 0 : num(a.course_id))),
    ].filter((n) => n > 0))];
    const { data: courseRows } = courseIds.length
      ? await this.#db.from('onyx_courses').select('id, code, title')
        .eq('tenant_id', id).in('id', courseIds)
      : { data: [] };
    const courses = new Map((courseRows ?? []).map((c) => [num(c.id),
      { id: num(c.id), code: String(c.code), title: String(c.title) }]));

    const exams = new Map((examQ.data ?? []).map((e) => [num(e.id), e]));
    const assessments = new Map((assessQ.data ?? []).map((a) => [num(a.id), a]));
    const markerCount = new Map<number, number>();
    for (const g of gradeQ.data ?? []) {
      const k = num(g.attempt_id);
      markerCount.set(k, (markerCount.get(k) ?? 0) + 1);
    }

    const users = await this.#usersById([...new Set([
      ...markRows.map((m) => num(m.user_id)), ...attemptRows.map((a) => num(a.user_id)),
    ])]);
    const person = (uid: number) => {
      const u = users.get(uid);
      return { id: uid, name: u?.name ?? 'Unknown', email: u?.email ?? '' };
    };

    const examMarks = markRows.map((m) => {
      const exam = exams.get(num(m.exam_id));
      return {
        id: num(m.id),
        kind: 'exam' as const,
        student: person(num(m.user_id)),
        exam: exam
          ? { id: num(exam.id), title: String(exam.title), starts_at: String(exam.starts_at) }
          : null,
        course: exam ? courses.get(num(exam.course_id)) ?? null : null,
        raw_marks: num(m.raw_marks),
        moderation_delta: num(m.moderation_delta),
        final_marks: num(m.final_marks),
        max_marks: exam ? num(exam.max_marks) : null,
        pass_marks: exam ? num(exam.pass_marks) : null,
        grade: m.grade == null ? null : String(m.grade),
        grade_points: m.grade_points == null ? null : num(m.grade_points),
        status: String(m.status),
        published_at: m.published_at ? String(m.published_at) : null,
        recorded_at: String(m.created_at),
      };
    });

    const assessmentGrades = attemptRows.map((a) => {
      const assessment = assessments.get(num(a.assessment_id));
      const courseId = assessment?.course_id == null ? 0 : num(assessment.course_id);
      return {
        id: num(a.id),
        kind: 'assessment' as const,
        student: person(num(a.user_id)),
        assessment: assessment
          ? { id: num(assessment.id), title: String(assessment.title) }
          : null,
        course: courses.get(courseId) ?? null,
        attempt: num(a.attempt),
        score: a.score == null ? null : num(a.score),
        max_score: num(a.max_score),
        pass_mark: assessment?.pass_mark == null ? null : num(assessment.pass_mark),
        status: String(a.status),
        marker_count: markerCount.get(num(a.id)) ?? 0,
        submitted_at: a.submitted_at ? String(a.submitted_at) : null,
      };
    });

    // A cohort summary over the rows actually read. When the list is capped
    // this describes the most recent `limit`, not the whole institution --
    // hence `over_rows`, which the page prints rather than implying a census.
    const examScored = examMarks.filter((m) => m.max_marks && m.max_marks > 0);
    const examPercents = examScored.map((m) => (m.final_marks / m.max_marks!) * 100);
    const examPassable = examScored.filter((m) => m.pass_marks != null);
    const assessScored = assessmentGrades
      .filter((g) => g.score != null && g.max_score > 0);
    const assessPercents = assessScored.map((g) => (g.score! / g.max_score) * 100);
    const assessPassable = assessScored.filter((g) => g.pass_mark != null);
    const rate = (hits: number, of: number) =>
      (of === 0 ? null : Math.round((hits / of) * 1000) / 10);

    const summary = {
      exams: {
        count: examMarks.length,
        mean_percent: mean(examPercents),
        mean_marks: mean(examScored.map((m) => m.final_marks)),
        pass_rate: rate(examPassable.filter((m) => m.final_marks >= m.pass_marks!).length,
          examPassable.length),
        published: examMarks.filter((m) => m.status === 'published').length,
        over_rows: examMarks.length,
      },
      assessments: {
        count: assessmentGrades.length,
        mean_percent: mean(assessPercents),
        pass_rate: rate(
          assessPassable.filter((g) => (g.score! / g.max_score) * 100 >= g.pass_mark!).length,
          assessPassable.length),
        over_rows: assessmentGrades.length,
      },
    };

    await this.#log(actorId, 'tenant.grades_read', 'tenant', num(tenant.id), null, {
      slug: tenant.slug,
      exam_marks_read: examMarks.length,
      assessment_grades_read: assessmentGrades.length,
      limit,
    });

    return {
      tenant: { id: num(tenant.id), name: String(tenant.name), slug: String(tenant.slug) },
      limit,
      capped: {
        exam_marks: (markQ.data ?? []).length > limit,
        assessment_grades: (attemptQ.data ?? []).length > limit,
      },
      exam_marks: examMarks,
      assessment_grades: assessmentGrades,
      summary,
    };
  }

  /**
   * The same shape public signup uses (tenancy.service.ts's createTenant),
   * duplicated rather than shared: signup's version is deliberately
   * unauthenticated, because that is how the first institution can exist at
   * all. This one is deliberately gated, because an operator provisioning an
   * institution on someone's behalf is a different act worth its own audit
   * entry, not the same code path with the door left open.
   */
  async createTenant(input: {
    name: string; slug?: string; plan?: string | null;
    admin: { name: string; email: string; password: string };
  }, actorId: number | null) {
    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw new HttpError(422, 'That name does not make a usable address.');
    const { data: clash } = await this.#db.from('onyx_tenants')
      .select('id').eq('slug', slug).maybeSingle();
    if (clash) throw new HttpError(422, 'An institution with that address already exists.');

    const { data: tenant, error } = await this.#db.from('onyx_tenants').insert({
      name: input.name.trim(), slug, status: 1, plan: input.plan ?? null,
    }).select(TENANT_COLUMNS).maybeSingle();
    if (error) throw new HttpError(500, 'Could not create the institution: ' + error.message);

    const email = input.admin.email.trim().toLowerCase();
    const { data: existingUser } = await this.#db.from('onyx_users')
      .select('id, email, name').eq('email', email).maybeSingle();
    let admin = existingUser;
    if (!admin) {
      const { data: created } = await this.#db.from('onyx_users').insert({
        email, name: input.admin.name.trim(),
        password: await hashPassword(input.admin.password), status: 1,
      }).select('id, email, name').maybeSingle();
      admin = created!;
    }
    await this.#db.from('onyx_memberships').insert({
      tenant_id: Number(tenant!.id), user_id: Number(admin!.id), role: 'admin', status: 1,
    });

    await this.#log(actorId, 'tenant.created', 'tenant', Number(tenant!.id),
      null, { name: tenant!.name, slug: tenant!.slug, provisioned_by: 'platform' });
    return { tenant, admin: { id: admin!.id, email: admin!.email } };
  }

  async suspend(id: number, actorId: number | null) {
    const before = await this.tenant(id);
    const { data } = await this.#db.from('onyx_tenants')
      .update({ status: 0, updated_at: new Date().toISOString() })
      .eq('id', id).select(TENANT_COLUMNS).maybeSingle();
    await this.#log(actorId, 'tenant.suspended', 'tenant', id,
      { status: before.status }, { status: 0 });
    return data;
  }

  async activate(id: number, actorId: number | null) {
    const before = await this.tenant(id);
    const { data } = await this.#db.from('onyx_tenants')
      .update({ status: 1, updated_at: new Date().toISOString() })
      .eq('id', id).select(TENANT_COLUMNS).maybeSingle();
    await this.#log(actorId, 'tenant.activated', 'tenant', id,
      { status: before.status }, { status: 1 });
    return data;
  }

  // -------------------------------------------------------------------------

  async auditLog(filters: { limit?: number } = {}) {
    const { data } = await this.#db.from('onyx_platform_audit_logs')
      .select('id, actor_id, action, entity_type, entity_id, before, after, created_at')
      .order('created_at', { ascending: false }).limit(filters.limit ?? 100);
    return data ?? [];
  }

  async #log(actorId: number | null, action: string, entityType: string, entityId: number | null,
    before: unknown, after: unknown) {
    // Never throw: an audit row describes work that already happened.
    await this.#db.from('onyx_platform_audit_logs').insert({
      actor_id: actorId, action, entity_type: entityType, entity_id: entityId,
      before: before as never, after: after as never,
    });
  }
}
