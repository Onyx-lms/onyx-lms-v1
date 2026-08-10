/**
 * LRN-03 -- attendance.
 *
 * "Session attendance capture via QR or manual roster with per-learner and
 * per-cohort attendance analytics."
 *
 * The QR design, because it is the part that can be cheated:
 *
 *   * The code is never stored. It is an HMAC of a per-session secret and the
 *     current time window, recomputed on both sides. A leaked database gives
 *     an attacker no codes, only secrets that stop working when a session ends.
 *   * It rotates every `qr_window_seconds` (30 by default), so a photograph of
 *     the projector is worthless half a minute later.
 *   * Only the CURRENT window is accepted. A grace window would double the
 *     useful life of a shared screenshot for no real benefit -- the code on
 *     screen is always current.
 *   * The endpoint takes no learner id. Who is marked present comes from the
 *     token, so one learner physically cannot mark another.
 *
 * None of that stops someone sending a photo of the screen to a friend outside
 * the room. It is a deterrent with a 30-second half-life, not proof of
 * presence, and it should not be described as more than that.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OnyxDb } from './db.ts';
import type { AttendanceStatus, Role } from '@onyx/types';
import { HttpError } from '../http/errors.ts';
import type { AcademicsService } from './academics.service.ts';

const SESSION_COLUMNS = 'id, tenant_id, course_id, title, scheduled_at, duration_minutes, status, qr_window_seconds, created_by, created_at';
const RECORD_COLUMNS = 'id, tenant_id, session_id, user_id, status, method, note, marked_by, marked_at';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

/** Counted as having attended. Late is still there; excused is neither. */
const ATTENDED: AttendanceStatus[] = ['present', 'late'];

export class AttendanceService {
  #db: OnyxDb;
  #academics: AcademicsService;
  /** Injectable so tests can move time without waiting for it. */
  #now: () => number;

  constructor(db: OnyxDb, academics: AcademicsService, now: () => number = Date.now) {
    this.#db = db;
    this.#academics = academics;
    this.#now = now;
  }

  // ---- LRN-03a: sessions ----

  async createSession(tenantId: number, courseId: number, createdBy: number, input: {
    title: string; scheduled_at: string; duration_minutes?: number; qr_window_seconds?: number;
  }) {
    await this.#academics.course(tenantId, courseId);
    const window = input.qr_window_seconds ?? 30;
    if (window < 10 || window > 300) {
      throw new HttpError(422, 'A code window must be between 10 and 300 seconds.');
    }

    const { data, error } = await this.#db.from('onyx_attendance_sessions').insert({
      tenant_id: tenantId,
      course_id: courseId,
      title: input.title.trim(),
      scheduled_at: input.scheduled_at,
      duration_minutes: input.duration_minutes ?? 60,
      status: 'open',
      qr_secret: randomBytes(24).toString('hex'),
      qr_window_seconds: window,
      created_by: createdBy,
    }).select(SESSION_COLUMNS).maybeSingle();
    if (error) throw new HttpError(500, 'Could not create the session: ' + error.message);
    // SESSION_COLUMNS already omits qr_secret. Deleting it as well means a
    // careless edit to that list cannot turn into a leaked secret.
    const { qr_secret, ...session } = (data ?? {}) as Record<string, unknown>;
    void qr_secret;
    return session as NonNullable<typeof data>;
  }

  async sessions(tenantId: number, courseId: number) {
    const { data } = await this.#db.from('onyx_attendance_sessions')
      .select(SESSION_COLUMNS)
      .eq('tenant_id', tenantId).eq('course_id', courseId)
      .order('scheduled_at', { ascending: false });
    return data ?? [];
  }

  async session(tenantId: number, id: number) {
    const { data } = await this.#db.from('onyx_attendance_sessions')
      .select(SESSION_COLUMNS).eq('tenant_id', tenantId).eq('id', id).maybeSingle();
    if (!data) throw new HttpError(404, 'Session not found.');
    return data;
  }

  async closeSession(tenantId: number, id: number) {
    await this.session(tenantId, id);
    await this.#db.from('onyx_attendance_sessions')
      .update({ status: 'closed', updated_at: new Date(this.#now()).toISOString() })
      .eq('tenant_id', tenantId).eq('id', id);
    return { id, status: 'closed' };
  }

  /** The roster to mark: everyone enrolled, with whatever is recorded so far. */
  async roster(tenantId: number, sessionId: number) {
    const session = await this.session(tenantId, sessionId);
    const [enrolled, records] = await Promise.all([
      this.#academics.roster(tenantId, Number(session.course_id)),
      this.records(tenantId, sessionId),
    ]);
    const byUser = new Map(records.map((r) => [Number(r.user_id), r]));
    return {
      session,
      roster: enrolled.map((e) => ({
        user_id: Number(e.user_id),
        record: byUser.get(Number(e.user_id)) ?? null,
      })),
    };
  }

  async records(tenantId: number, sessionId: number) {
    const { data } = await this.#db.from('onyx_attendance_records')
      .select(RECORD_COLUMNS).eq('tenant_id', tenantId).eq('session_id', sessionId);
    return data ?? [];
  }

  /**
   * Faculty marking the roster.
   *
   * Everyone is written in one call because attendance is taken for a room, not
   * a person -- and a half-marked roster is indistinguishable from a room where
   * half the class was absent.
   */
  async mark(tenantId: number, sessionId: number, markedBy: number, entries: {
    user_id: number; status: AttendanceStatus; note?: string | null;
  }[]) {
    const session = await this.session(tenantId, sessionId);
    for (const e of entries) {
      if (!ATTENDANCE_STATUSES.includes(e.status)) {
        throw new HttpError(422, '"' + e.status + '" is not an attendance status.');
      }
    }

    const enrolled = new Set(
      (await this.#academics.roster(tenantId, Number(session.course_id)))
        .map((e) => Number(e.user_id)));
    const stray = entries.find((e) => !enrolled.has(Number(e.user_id)));
    if (stray) throw new HttpError(422, 'Someone in that list is not enrolled in this course.');

    const existing = new Map(
      (await this.records(tenantId, sessionId)).map((r) => [Number(r.user_id), r]));
    const at = new Date(this.#now()).toISOString();
    let created = 0;
    let amended = 0;

    for (const e of entries) {
      const prior = existing.get(Number(e.user_id));
      if (prior) {
        await this.#db.from('onyx_attendance_records').update({
          status: e.status, note: e.note ?? null, method: 'manual',
          marked_by: markedBy, marked_at: at,
        }).eq('id', prior.id);
        amended += 1;
      } else {
        await this.#db.from('onyx_attendance_records').insert({
          tenant_id: tenantId, session_id: sessionId, user_id: e.user_id,
          status: e.status, method: 'manual', note: e.note ?? null,
          marked_by: markedBy, marked_at: at,
        });
        created += 1;
      }
    }
    return { created, amended };
  }

  // ---- LRN-03b: QR self check-in ----

  /**
   * The code to put on screen, and how long it lasts.
   *
   * Faculty-facing: a learner who could read this could mark themselves present
   * from anywhere.
   */
  async currentCode(tenantId: number, sessionId: number) {
    const session = await this.session(tenantId, sessionId);
    if (session.status !== 'open') throw new HttpError(422, 'This session is closed.');

    const secret = await this.#secret(tenantId, sessionId);
    const window = Number(session.qr_window_seconds);
    const counter = Math.floor(this.#now() / 1000 / window);
    return {
      code: this.#code(secret, sessionId, counter),
      // How long the code on screen stays valid, so the display can count down
      // rather than refresh at an arbitrary moment.
      expires_in_seconds: window - Math.floor((this.#now() / 1000) % window),
      window_seconds: window,
    };
  }

  /**
   * A learner marking themselves present.
   *
   * `userId` comes from the caller's token. There is no parameter for it, so
   * "a learner cannot mark another learner" is structural rather than checked.
   */
  async checkIn(tenantId: number, sessionId: number, userId: number, code: string) {
    const session = await this.session(tenantId, sessionId);
    if (session.status !== 'open') throw new HttpError(422, 'This session is closed.');
    await this.#academics.assertEnrolled(tenantId, Number(session.course_id), userId);

    const secret = await this.#secret(tenantId, sessionId);
    const window = Number(session.qr_window_seconds);
    const counter = Math.floor(this.#now() / 1000 / window);
    const expected = this.#code(secret, sessionId, counter);
    if (!constantTimeEqual(code.trim(), expected)) {
      // Deliberately the same message for a wrong code and an expired one:
      // distinguishing them tells someone with an old screenshot that they are
      // otherwise on the right track.
      throw new HttpError(422, 'That code is not valid right now.');
    }

    const existing = (await this.records(tenantId, sessionId))
      .find((r) => Number(r.user_id) === userId);
    if (existing) {
      // A code is shared by the whole room for its window, so replay protection
      // is per learner: they are already marked, and a second scan changes
      // nothing. Faculty can still amend it afterwards.
      throw new HttpError(422, 'You are already marked for this session.');
    }

    const at = new Date(this.#now()).toISOString();
    const late = this.#isLate(session, this.#now());
    const { data, error } = await this.#db.from('onyx_attendance_records').insert({
      tenant_id: tenantId, session_id: sessionId, user_id: userId,
      status: late ? 'late' : 'present',
      method: 'qr',
      // marked_by is the learner themselves. Recording that is the difference
      // between a record and an assertion.
      marked_by: userId,
      marked_at: at,
    }).select(RECORD_COLUMNS).maybeSingle();
    if (error?.code === '23505') throw new HttpError(422, 'You are already marked for this session.');
    if (error) throw new HttpError(500, 'Could not record your attendance: ' + error.message);
    return data!;
  }

  // ---- LRN-03c: analytics ----

  /**
   * Attendance percentages.
   *
   * The definition, stated once so it cannot drift: **present and late count as
   * attended; excused sessions are removed from the denominator rather than
   * counted against anyone; a session with no record at all counts as absent.**
   *
   * That last clause matters. Treating an unmarked session as "no data" makes
   * every percentage flattering, and a shortfall report that never flags anyone
   * is worse than none.
   */
  async courseAnalytics(tenantId: number, courseId: number, threshold = 75) {
    const [sessions, roster] = await Promise.all([
      this.sessions(tenantId, courseId),
      this.#academics.roster(tenantId, courseId),
    ]);
    if (!sessions.length) {
      return { sessions: 0, threshold, learners: [], cohort: { held: 0, percent: 0, below: 0 } };
    }

    const ids = sessions.map((s) => Number(s.id));
    const { data } = await this.#db.from('onyx_attendance_records')
      .select(RECORD_COLUMNS).eq('tenant_id', tenantId).in('session_id', ids);
    const records = data ?? [];

    const learners = roster.map((e) => {
      const userId = Number(e.user_id);
      const mine = records.filter((r) => Number(r.user_id) === userId);
      const excused = mine.filter((r) => r.status === 'excused').length;
      const attended = mine.filter((r) => ATTENDED.includes(r.status as AttendanceStatus)).length;
      const counted = sessions.length - excused;
      const percent = counted > 0 ? Math.round((attended / counted) * 1000) / 10 : 100;
      return {
        user_id: userId,
        held: sessions.length,
        attended,
        excused,
        // Everything not attended and not excused, including sessions where
        // nobody marked them at all.
        absent: counted - attended,
        percent,
        below_threshold: percent < threshold,
      };
    });

    const below = learners.filter((l) => l.below_threshold).length;
    const cohortPercent = learners.length
      ? Math.round((learners.reduce((sum, l) => sum + l.percent, 0) / learners.length) * 10) / 10
      : 0;

    return {
      sessions: sessions.length,
      threshold,
      learners,
      cohort: { held: sessions.length, percent: cohortPercent, below },
    };
  }

  /** One learner's own figure, across every course they are enrolled in. */
  async learnerSummary(tenantId: number, userId: number, threshold = 75) {
    const enrollments = await this.#academics.enrollmentsFor(tenantId, userId);
    const out = [];
    for (const e of enrollments) {
      const analytics = await this.courseAnalytics(tenantId, Number(e.course_id), threshold);
      const mine = analytics.learners.find((l) => l.user_id === userId);
      if (mine) out.push({ course_id: Number(e.course_id), ...mine });
    }
    return out;
  }

  /** LRN-03c export: one row per learner per session, flat enough for a sheet. */
  async exportRows(tenantId: number, courseId: number) {
    const [sessions, roster] = await Promise.all([
      this.sessions(tenantId, courseId),
      this.#academics.roster(tenantId, courseId),
    ]);
    if (!sessions.length || !roster.length) return [];

    const { data } = await this.#db.from('onyx_attendance_records')
      .select(RECORD_COLUMNS).eq('tenant_id', tenantId)
      .in('session_id', sessions.map((s) => Number(s.id)));
    const byKey = new Map((data ?? []).map((r) => [r.session_id + ':' + r.user_id, r]));

    return roster.flatMap((e) => sessions.map((s) => {
      const record = byKey.get(s.id + ':' + e.user_id);
      return {
        session_id: Number(s.id),
        session: s.title,
        scheduled_at: s.scheduled_at,
        user_id: Number(e.user_id),
        // An unmarked session is an absence, consistently with the percentages.
        status: record?.status ?? 'absent',
        method: record?.method ?? null,
      };
    }));
  }

  // ---- internals ----

  /**
   * The secret is read on its own and never returned by any other method, so a
   * response cannot leak it by accident.
   */
  async #secret(tenantId: number, sessionId: number): Promise<string> {
    const { data } = await this.#db.from('onyx_attendance_sessions')
      .select('qr_secret').eq('tenant_id', tenantId).eq('id', sessionId).maybeSingle();
    if (!data?.qr_secret) throw new HttpError(422, 'This session has no check-in code.');
    return data.qr_secret;
  }

  #code(secret: string, sessionId: number, counter: number): string {
    return createHmac('sha256', secret)
      .update(sessionId + ':' + counter)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();
  }

  /** Late once the session is more than a quarter of the way through. */
  #isLate(session: { scheduled_at: string; duration_minutes: number }, now: number): boolean {
    const start = Date.parse(session.scheduled_at);
    if (Number.isNaN(start)) return false;
    const grace = (Number(session.duration_minutes) || 60) * 60_000 * 0.25;
    return now > start + grace;
  }
}

/** Compares without leaking where the difference is. */
function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
