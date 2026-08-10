/**
 * CMP-04 -- the parent and guardian portal.
 *
 * "Guardian accounts linked to learners with attendance, results and fee
 * visibility, plus notifications on key events." The acceptance criterion is
 * the whole of the design: "a guardian sees their own children only, and
 * **nothing a learner has not consented to share**."
 *
 * That second clause is why this is a service rather than a role check. Three
 * separate ideas have to hold at once:
 *
 *   * **A link is a request until the learner accepts it.** An unverified link
 *     grants nothing. Anyone can claim to be somebody's parent; the learner is
 *     the only one who can confirm it.
 *   * **Consent is per category and defaults to nothing.** Accepting a link is
 *     not accepting everything on it. Attendance, results and fees are three
 *     separate switches, and a newly accepted link has all three off.
 *   * **Consent is revocable, and revoking is immediate.** There is no cached
 *     view: every read re-checks the switch, so turning it off closes the page
 *     that is already open the next time it loads.
 *
 * A guardian has no course, no submission and no profile of their own -- the
 * whole account is a view derived from links other people control. That is also
 * why the guardian role is not "a weaker student": every check here names the
 * link, not the role.
 */
import type { OnyxDb } from './db.ts';
import type { Role } from '@onyx/types';
import { HttpError } from '../http/errors.ts';
import type { AuditService } from './audit.service.ts';
import type { ExaminationsService } from './examinations.service.ts';

const GUARDIAN_COLUMNS = 'id, tenant_id, guardian_user_id, student_user_id, relationship, can_view_attendance, can_view_results, can_view_fees, verified_at, created_at, updated_at';

export type ConsentScope = 'attendance' | 'results' | 'fees';

const CONSENT_COLUMN: Record<ConsentScope, 'can_view_attendance' | 'can_view_results' | 'can_view_fees'> = {
  attendance: 'can_view_attendance',
  results: 'can_view_results',
  fees: 'can_view_fees',
};

export class GuardianService {
  #db: OnyxDb;
  #audit: AuditService;
  #exams: ExaminationsService;
  #now: () => number;

  constructor(db: OnyxDb, audit: AuditService, exams: ExaminationsService,
    now: () => number = Date.now) {
    this.#db = db;
    this.#audit = audit;
    this.#exams = exams;
    this.#now = now;
  }

  // -------------------------------------------------------------------------
  // Linking
  // -------------------------------------------------------------------------

  /**
   * Propose a link between a guardian account and a learner.
   *
   * Staff or the learner may propose one. A guardian may not propose their own:
   * that would let anyone with an account claim a child and then wait to see
   * whether the learner noticed the request.
   */
  async link(tenantId: number, actor: { userId: number; role: Role }, input: {
    guardian_user_id: number; student_user_id: number; relationship?: string;
  }) {
    const staff = actor.role === 'admin' || actor.role === 'faculty';
    const isTheLearner = actor.userId === input.student_user_id;
    if (!staff && !isTheLearner) {
      throw new HttpError(403, 'A guardian link is created by the learner or by staff.');
    }
    if (input.guardian_user_id === input.student_user_id) {
      throw new HttpError(422, 'A person cannot be their own guardian.');
    }

    for (const [id, label, wanted] of [
      [input.guardian_user_id, 'guardian', 'guardian'],
      [input.student_user_id, 'learner', 'student'],
    ] as const) {
      const { data: membership } = await this.#db.from('onyx_memberships').select('role')
        .eq('tenant_id', tenantId).eq('user_id', id).eq('status', 1).maybeSingle();
      if (!membership) {
        throw new HttpError(404, 'No such ' + label + ' in this institution.');
      }
      if (membership.role !== wanted) {
        throw new HttpError(422, 'That account is not a ' + wanted + '.');
      }
    }

    const { data, error } = await this.#db.from('onyx_guardians').insert({
      tenant_id: tenantId,
      guardian_user_id: input.guardian_user_id,
      student_user_id: input.student_user_id,
      relationship: (input.relationship ?? 'guardian').trim(),
      // Every switch off. Accepting a link is not accepting everything on it.
      can_view_attendance: false,
      can_view_results: false,
      can_view_fees: false,
      // A learner linking their own guardian has already consented to the link
      // itself; staff proposing one have not asked anybody yet.
      verified_at: isTheLearner ? new Date(this.#now()).toISOString() : null,
    }).select(GUARDIAN_COLUMNS).maybeSingle();

    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        throw new HttpError(409, 'That guardian is already linked to that learner.');
      }
      throw new HttpError(500, 'Could not create the link: ' + error.message);
    }

    await this.#audit.record(
      { tenant_id: tenantId, user_id: actor.userId },
      { action: 'guardian.linked', entityType: 'guardian', entityId: Number(data!.id),
        after: { guardian_user_id: input.guardian_user_id,
          student_user_id: input.student_user_id, verified: isTheLearner } });
    return data;
  }

  /** The learner accepting a link staff proposed. Only they can do this. */
  async accept(tenantId: number, linkId: number, actor: { userId: number }) {
    const link = await this.#link(tenantId, linkId);
    if (Number(link.student_user_id) !== actor.userId) {
      throw new HttpError(403, 'Only the learner can accept a guardian link.');
    }
    const { data } = await this.#db.from('onyx_guardians').update({
      verified_at: new Date(this.#now()).toISOString(),
      updated_at: new Date(this.#now()).toISOString(),
    }).eq('tenant_id', tenantId).eq('id', linkId).select(GUARDIAN_COLUMNS).maybeSingle();
    return data;
  }

  /**
   * Turn one category of sharing on or off.
   *
   * The learner, or an administrator. Faculty are deliberately excluded: a
   * lecturer deciding what a learner's parent may see is not a judgement the
   * course relationship carries.
   */
  async setConsent(tenantId: number, linkId: number, actor: { userId: number; role: Role },
    scope: ConsentScope, allowed: boolean) {
    const link = await this.#link(tenantId, linkId);
    const isTheLearner = Number(link.student_user_id) === actor.userId;
    if (!isTheLearner && actor.role !== 'admin') {
      throw new HttpError(403, 'Only the learner can change what is shared.');
    }
    if (!CONSENT_COLUMN[scope]) throw new HttpError(422, 'No such sharing category.');

    const column = CONSENT_COLUMN[scope];
    const { data } = await this.#db.from('onyx_guardians')
      .update({ [column]: allowed, updated_at: new Date(this.#now()).toISOString() })
      .eq('tenant_id', tenantId).eq('id', linkId).select(GUARDIAN_COLUMNS).maybeSingle();

    await this.#audit.record(
      { tenant_id: tenantId, user_id: actor.userId },
      { action: 'guardian.consent_changed', entityType: 'guardian', entityId: linkId,
        before: { [scope]: link[column] }, after: { [scope]: allowed } });
    return data;
  }

  async unlink(tenantId: number, linkId: number, actor: { userId: number; role: Role }) {
    const link = await this.#link(tenantId, linkId);
    const isTheLearner = Number(link.student_user_id) === actor.userId;
    if (!isTheLearner && actor.role !== 'admin') {
      throw new HttpError(403, 'Only the learner can remove a guardian.');
    }
    await this.#db.from('onyx_guardians').delete().eq('tenant_id', tenantId).eq('id', linkId);
    return { ok: true };
  }

  /** The links a learner has, so they can see who is watching and change it. */
  async linksForStudent(tenantId: number, studentId: number, actor: { userId: number; role: Role }) {
    if (actor.userId !== studentId && actor.role !== 'admin') {
      throw new HttpError(403, 'Those are not your guardians.');
    }
    const { data } = await this.#db.from('onyx_guardians').select(GUARDIAN_COLUMNS)
      .eq('tenant_id', tenantId).eq('student_user_id', studentId);
    return this.#withNames(data ?? [], 'guardian_user_id');
  }

  /** The children a guardian is linked to. Verified links only. */
  async children(tenantId: number, guardianId: number) {
    const { data } = await this.#db.from('onyx_guardians').select(GUARDIAN_COLUMNS)
      .eq('tenant_id', tenantId).eq('guardian_user_id', guardianId)
      .not('verified_at', 'is', null);
    return this.#withNames(data ?? [], 'student_user_id');
  }

  async #withNames<T extends Record<string, unknown>>(
    rows: T[], field: 'guardian_user_id' | 'student_user_id',
  ): Promise<(T & { name: string | null; email: string | null })[]> {
    if (!rows.length) return [];
    const { data } = await this.#db.from('onyx_users').select('id, name, email')
      .in('id', rows.map((r) => Number(r[field])));
    const byId = new Map((data ?? []).map((u) => [Number(u.id), u]));
    return rows.map((r) => ({
      ...r,
      name: (byId.get(Number(r[field]))?.name ?? null) as string | null,
      email: (byId.get(Number(r[field]))?.email ?? null) as string | null,
    }));
  }

  // -------------------------------------------------------------------------
  // Reading, through the consent
  // -------------------------------------------------------------------------

  /**
   * The link that lets this guardian see this scope of this learner, or a
   * refusal.
   *
   * Deliberately one function, called by every read path. A second place that
   * decides what a guardian may see is a second place to get it wrong, and the
   * failure is silent: nobody notices extra data on a page they were expecting
   * to see something on.
   *
   * The 404 for "no link at all" is deliberate too. Answering 403 would tell a
   * stranger that the learner exists.
   */
  async #consented(tenantId: number, guardianId: number, studentId: number,
    scope: ConsentScope) {
    const { data } = await this.#db.from('onyx_guardians').select(GUARDIAN_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('guardian_user_id', guardianId).eq('student_user_id', studentId)
      .maybeSingle();
    if (!data) throw new HttpError(404, 'No such learner.');
    if (!data.verified_at) {
      throw new HttpError(403, 'That link has not been accepted yet.');
    }
    if (!data[CONSENT_COLUMN[scope]]) {
      throw new HttpError(403, 'That learner has not shared their '
        + scope + ' with you.');
    }
    return data;
  }

  async attendanceFor(tenantId: number, guardianId: number, studentId: number) {
    await this.#consented(tenantId, guardianId, studentId, 'attendance');

    const { data: records } = await this.#db.from('onyx_attendance_records')
      .select('id, session_id, status, marked_at')
      .eq('tenant_id', tenantId).eq('user_id', studentId)
      .order('marked_at', { ascending: false }).limit(100);

    const rows = records ?? [];
    const attended = rows.filter((r) => r.status === 'present' || r.status === 'late').length;

    // The summary, and the sessions -- but not who else was there, and not the
    // notes a lecturer wrote against an absence.
    return {
      attended,
      total: rows.length,
      percent: rows.length ? Math.round((attended / rows.length) * 100) : 0,
      records: rows.map((r) => ({
        session_id: Number(r.session_id),
        status: r.status,
        marked_at: r.marked_at,
      })),
    };
  }

  async resultsFor(tenantId: number, guardianId: number, studentId: number) {
    await this.#consented(tenantId, guardianId, studentId, 'results');
    // Published marks only, through the examinations service -- a guardian
    // cannot see a paper before the learner does.
    const marks = await this.#exams.publishedMarks(tenantId, studentId);

    const detailed = [];
    for (const mark of marks) {
      const exam = await this.#exams.exam(tenantId, Number(mark.exam_id));
      detailed.push({
        exam_id: Number(mark.exam_id),
        title: exam.title,
        final_marks: Number(mark.final_marks),
        max_marks: Number(exam.max_marks),
        grade: mark.grade,
      });
    }
    return { results: detailed };
  }

  async feesFor(tenantId: number, guardianId: number, studentId: number) {
    await this.#consented(tenantId, guardianId, studentId, 'fees');

    const { data } = await this.#db.from('onyx_invoices')
      .select('id, number, currency, total_minor, paid_minor, status, due_at, issued_at')
      .eq('tenant_id', tenantId).eq('user_id', studentId)
      .order('issued_at', { ascending: false });

    const invoices = data ?? [];
    return {
      invoices,
      outstanding_minor: invoices
        .filter((i) => i.status === 'issued' || i.status === 'part_paid')
        .reduce((sum, i) => sum + (Number(i.total_minor) - Number(i.paid_minor)), 0),
    };
  }

  /**
   * The guardian's landing page: every child, and what is visible for each.
   *
   * Scopes with no consent are reported as `false` rather than omitted, so the
   * page can say "not shared" instead of quietly showing nothing and leaving a
   * parent to guess whether their child has no marks or has not shared them.
   */
  async overview(tenantId: number, guardianId: number) {
    const links = await this.children(tenantId, guardianId);
    const out = [];
    for (const link of links) {
      const studentId = Number(link.student_user_id);
      const shares = {
        attendance: Boolean(link.can_view_attendance),
        results: Boolean(link.can_view_results),
        fees: Boolean(link.can_view_fees),
      };
      out.push({
        link_id: Number(link.id),
        student_user_id: studentId,
        name: link.name,
        relationship: link.relationship,
        shares,
        attendance: shares.attendance
          ? await this.attendanceFor(tenantId, guardianId, studentId)
          : null,
        results: shares.results
          ? await this.resultsFor(tenantId, guardianId, studentId)
          : null,
        fees: shares.fees ? await this.feesFor(tenantId, guardianId, studentId) : null,
      });
    }
    return { children: out };
  }

  async #link(tenantId: number, id: number) {
    const { data } = await this.#db.from('onyx_guardians').select(GUARDIAN_COLUMNS)
      .eq('tenant_id', tenantId).eq('id', id).maybeSingle();
    if (!data) throw new HttpError(404, 'No such guardian link.');
    return data;
  }
}
