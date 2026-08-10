/**
 * ASS-02 -- remote proctoring.
 *
 * "Camera and screen monitoring with tab-switch detection and reviewable
 * integrity flags for each attempt."
 *
 * What this stores, and what it deliberately does not:
 *
 *   * It stores **events** -- a tab lost focus at 14:03:22, a paste happened,
 *     the camera stopped. Each is timestamped by the server and reviewable.
 *   * It does **not** store a continuous recording of a learner's room. The
 *     proposal asks for monitoring and reviewable flags, not a video archive,
 *     and keeping hours of footage of somebody's home is a decision with
 *     consequences nobody asked for. Where a still genuinely helps a human
 *     decide, one can be attached to a single event.
 *   * Consent is per attempt and recorded before the paper is dealt. Monitoring
 *     somebody who has not been asked is not proctoring.
 *
 * A flag is evidence, not a verdict. Nothing here fails anybody: it raises
 * events for an invigilator, and an invigilator decides. The alternative --
 * auto-voiding an attempt because a laptop lid closed -- is how proctoring gets
 * a deserved bad name.
 */
import type { OnyxDb } from './db.ts';
import { HttpError } from '../http/errors.ts';
import type { AuditService } from './audit.service.ts';

const EVENT_COLUMNS = 'id, tenant_id, attempt_id, kind, weight, detail, media_path, at, client_at, review, reviewed_by, reviewed_at, review_note';
const ATTEMPT_COLUMNS = 'id, tenant_id, assessment_id, user_id, attempt, status, started_at, expires_at, submitted_at, integrity_flags, integrity_status, consented_at';

/**
 * What each kind of event is worth.
 *
 * Zero means "recorded, not suspicious". The weights are deliberately modest:
 * one tab switch is a notification popping up, five in ten minutes is a
 * pattern, and the difference between those is what an invigilator is for.
 */
export const EVENT_WEIGHTS: Record<string, number> = {
  consent: 0,
  camera_on: 0,
  camera_off: 2,
  screen_on: 0,
  screen_off: 2,
  tab_focus: 0,
  tab_blur: 1,
  paste: 2,
  copy: 1,
  fullscreen_exit: 1,
  no_face: 1,
  multiple_faces: 3,
  snapshot: 0,
};

export const EVENT_KINDS = Object.keys(EVENT_WEIGHTS);

/** Above this, an attempt goes to the review queue. */
export const REVIEW_THRESHOLD = 5;

export class ProctorService {
  #db: OnyxDb;
  #audit: AuditService;
  #now: () => number;

  constructor(db: OnyxDb, audit: AuditService, now: () => number = Date.now) {
    this.#db = db;
    this.#audit = audit;
    this.#now = now;
  }

  /**
   * Records one event from a candidate's own session.
   *
   * The attempt comes from the caller's token, never from the body, so nobody
   * can post events onto somebody else's paper. `client_at` is kept beside the
   * server's time rather than instead of it: a divergence between the two is
   * itself worth seeing.
   */
  async record(tenantId: number, attemptId: number, userId: number, input: {
    kind: string; detail?: unknown; client_at?: string | null; media_path?: string | null;
  }) {
    const attempt = await this.#attempt(tenantId, attemptId);
    if (Number(attempt.user_id) !== userId) throw new HttpError(403, 'That is not your attempt.');
    if (!EVENT_KINDS.includes(input.kind)) throw new HttpError(422, 'That is not an event kind.');
    // Events after the paper is in are noise, and accepting them would let a
    // candidate pad their own log.
    if (attempt.status !== 'in_progress') throw new HttpError(422, 'That attempt is finished.');

    const weight = EVENT_WEIGHTS[input.kind] ?? 0;
    const { data, error } = await this.#db.from('onyx_proctor_events').insert({
      tenant_id: tenantId,
      attempt_id: attemptId,
      kind: input.kind,
      weight,
      detail: (input.detail ?? null) as never,
      media_path: input.media_path ?? null,
      at: new Date(this.#now()).toISOString(),
      client_at: input.client_at ?? null,
      review: weight > 0 ? 'open' : 'dismissed',
    }).select(EVENT_COLUMNS).maybeSingle();
    if (error) throw new HttpError(500, 'Could not record that: ' + error.message);

    if (weight > 0) await this.#rescore(tenantId, attemptId);
    return { id: data!.id, kind: data!.kind, at: data!.at };
  }

  /** ASS-02b -- the per-attempt integrity timeline. */
  async timeline(tenantId: number, attemptId: number) {
    const attempt = await this.#attempt(tenantId, attemptId);
    const { data } = await this.#db.from('onyx_proctor_events')
      .select(EVENT_COLUMNS).eq('tenant_id', tenantId).eq('attempt_id', attemptId).order('at');
    const events = data ?? [];

    return {
      attempt_id: attemptId,
      user_id: attempt.user_id,
      consented_at: attempt.consented_at,
      started_at: attempt.started_at,
      submitted_at: attempt.submitted_at,
      integrity_flags: attempt.integrity_flags,
      integrity_status: attempt.integrity_status,
      // Every monitored event, with the server's timestamp -- ASS-02a's
      // acceptance criterion is that each one is reviewable.
      events: events.map((e) => ({
        ...e,
        // How far into the attempt it happened, which is what an invigilator
        // actually reads.
        offset_seconds: Math.max(0,
          Math.round((Date.parse(e.at) - Date.parse(attempt.started_at)) / 1000)),
        // A client clock well out of step with the server's is itself a signal.
        clock_skew_seconds: e.client_at
          ? Math.round((Date.parse(e.client_at) - Date.parse(e.at)) / 1000)
          : null,
      })),
    };
  }

  /** ASS-02b -- everything an invigilator has to look at, worst first. */
  async reviewQueue(tenantId: number, assessmentId?: number) {
    let q = this.#db.from('onyx_assessment_attempts')
      .select(ATTEMPT_COLUMNS).eq('tenant_id', tenantId).gt('integrity_flags', 0);
    if (assessmentId) q = q.eq('assessment_id', assessmentId);
    const { data } = await q.order('integrity_flags', { ascending: false });
    const attempts = data ?? [];
    if (!attempts.length) return [];

    const { data: events } = await this.#db.from('onyx_proctor_events')
      .select(EVENT_COLUMNS).eq('tenant_id', tenantId)
      .in('attempt_id', attempts.map((a) => Number(a.id)));
    const open = new Map<number, number>();
    for (const e of events ?? []) {
      if (e.review === 'open') {
        open.set(Number(e.attempt_id), (open.get(Number(e.attempt_id)) ?? 0) + 1);
      }
    }

    return attempts.map((a) => ({
      attempt_id: Number(a.id),
      assessment_id: Number(a.assessment_id),
      user_id: Number(a.user_id),
      status: a.status,
      integrity_flags: a.integrity_flags,
      integrity_status: a.integrity_status,
      open_events: open.get(Number(a.id)) ?? 0,
    }));
  }

  /**
   * An invigilator's decision on one event.
   *
   * Audited, because ASS-02b's acceptance criterion is that the decision is --
   * and because "who cleared this" is the first question asked when a result is
   * challenged.
   */
  async review(tenantId: number, eventId: number, claims: { tenant_id: number; user_id: number }, input: {
    decision: 'dismissed' | 'upheld'; note?: string | null;
  }) {
    if (!['dismissed', 'upheld'].includes(input.decision)) {
      throw new HttpError(422, 'A flag is either dismissed or upheld.');
    }
    const { data: event } = await this.#db.from('onyx_proctor_events')
      .select(EVENT_COLUMNS).eq('tenant_id', tenantId).eq('id', eventId).maybeSingle();
    if (!event) throw new HttpError(404, 'Event not found.');

    const at = new Date(this.#now()).toISOString();
    await this.#db.from('onyx_proctor_events').update({
      review: input.decision, reviewed_by: claims.user_id,
      reviewed_at: at, review_note: input.note ?? null,
    }).eq('id', eventId);

    await this.#rescore(tenantId, Number(event.attempt_id));
    await this.#audit.record(claims, {
      action: 'assessment.flag_reviewed',
      entityType: 'proctor_event', entityId: eventId,
      before: { review: event.review },
      after: { review: input.decision, attempt_id: event.attempt_id, note: input.note ?? null },
    });
    return { id: eventId, review: input.decision, reviewed_at: at };
  }

  /** Closes off an attempt's integrity case one way or the other. */
  async settle(tenantId: number, attemptId: number, claims: { tenant_id: number; user_id: number }, input: {
    decision: 'cleared' | 'upheld'; note?: string | null;
  }) {
    if (!['cleared', 'upheld'].includes(input.decision)) {
      throw new HttpError(422, 'An attempt is either cleared or upheld.');
    }
    const attempt = await this.#attempt(tenantId, attemptId);
    await this.#db.from('onyx_assessment_attempts')
      .update({ integrity_status: input.decision, updated_at: new Date(this.#now()).toISOString() })
      .eq('id', attemptId);

    await this.#audit.record(claims, {
      action: 'assessment.flag_reviewed',
      entityType: 'assessment_attempt', entityId: attemptId,
      before: { integrity_status: attempt.integrity_status },
      after: { integrity_status: input.decision, note: input.note ?? null },
    });
    return { attempt_id: attemptId, integrity_status: input.decision };
  }

  /**
   * Recomputes an attempt's flag score from its open events.
   *
   * Dismissed events stop counting, which is the point of dismissing them. The
   * score is never a verdict -- `integrity_status` only moves to `review`, and
   * a human moves it from there.
   */
  async #rescore(tenantId: number, attemptId: number) {
    const { data } = await this.#db.from('onyx_proctor_events')
      .select(EVENT_COLUMNS).eq('tenant_id', tenantId).eq('attempt_id', attemptId);
    const score = (data ?? [])
      .filter((e) => e.review !== 'dismissed')
      .reduce((t, e) => t + Number(e.weight), 0);

    const attempt = await this.#attempt(tenantId, attemptId);
    // A decision already taken by a person is not overwritten by arithmetic.
    const settled = ['cleared', 'upheld'].includes(String(attempt.integrity_status));
    const status = settled
      ? attempt.integrity_status
      : (score >= REVIEW_THRESHOLD ? 'review' : (score > 0 ? 'flagged' : 'clean'));

    await this.#db.from('onyx_assessment_attempts')
      .update({ integrity_flags: score, integrity_status: status }).eq('id', attemptId);
  }

  async #attempt(tenantId: number, id: number) {
    const { data } = await this.#db.from('onyx_assessment_attempts')
      .select(ATTEMPT_COLUMNS).eq('tenant_id', tenantId).eq('id', id).maybeSingle();
    if (!data) throw new HttpError(404, 'Attempt not found.');
    return data;
  }
}
