/**
 * F-05 -- audit logging.
 *
 * The proposal promises "audit logs capture sensitive actions across academics,
 * assessment and finance for accountability". That is only true if writing one
 * is easier than forgetting to, so this is a single call with the tenant and
 * actor already in hand from the claims.
 *
 * Recording is deliberately best-effort: a failure to write the log must not
 * roll back the grade change it was describing. Failures are surfaced through
 * the logger instead, where they are visible without being destructive.
 */
import type { OnyxDb } from './db.ts';
import type { OnyxTokenClaims } from './auth.ts';

const COLUMNS = 'id, tenant_id, actor_id, action, entity_type, entity_id, before, after, ip, created_at';

/** The actions worth recording. A closed list, so the log stays searchable. */
export type AuditAction =
  | 'tenant.created' | 'tenant.updated'
  | 'membership.created' | 'membership.role_changed' | 'membership.removed'
  | 'enrolment.created' | 'enrolment.removed'
  | 'attendance.marked' | 'attendance.amended'
  | 'assignment.graded' | 'assignment.returned'
  | 'assessment.published' | 'assessment.grade_changed' | 'assessment.flag_reviewed'
  | 'certificate.issued' | 'certificate.revoked'
  | 'fee.updated' | 'invoice.written_off' | 'payment.recorded'
  | 'result.published' | 'transcript.generated';

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: number | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export class AuditService {
  #db: OnyxDb;
  #onError: (message: string) => void;

  constructor(db: OnyxDb, onError: (message: string) => void = () => {}) {
    this.#db = db;
    this.#onError = onError;
  }

  /** Records an action performed by the holder of these claims. */
  async record(
    claims: { tenant_id: number; user_id: number | null },
    entry: AuditEntry,
  ): Promise<void> {
    const { error } = await this.#db.from('onyx_audit_logs').insert({
      tenant_id: claims.tenant_id,
      // No actor rather than a fake one: actor_id references a real person, and
      // a placeholder id would fail the foreign key and lose the entry.
      actor_id: claims.user_id || null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      ip: entry.ip ?? null,
    });
    // Never throw: the audit row describes work that already happened, and
    // failing here would undo it.
    if (error) this.#onError('audit write failed (' + entry.action + '): ' + error.message);
  }

  /** System-initiated actions, with no human actor. */
  async recordSystem(tenantId: number, entry: AuditEntry): Promise<void> {
    await this.record({ tenant_id: tenantId, user_id: null }, entry);
  }

  /**
   * The log for one tenant, newest first. Never readable through PostgREST --
   * `onyx_audit_logs` has RLS with no select policy, so this service-role path is
   * the only way in, and the routes restrict it to admins.
   */
  async list(tenantId: number, filters: {
    action?: string; entityType?: string; entityId?: number; limit?: number;
  } = {}) {
    let query = this.#db.from('onyx_audit_logs')
      .select(COLUMNS).eq('tenant_id', tenantId);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.entityType) query = query.eq('entity_type', filters.entityType);
    if (filters.entityId !== undefined) query = query.eq('entity_id', filters.entityId);

    const { data } = await query
      .order('id', { ascending: false })
      .limit(Math.min(filters.limit ?? 100, 500));
    const rows = data ?? [];

    const ids = [...new Set(rows.map((r) => Number(r.actor_id)).filter(Boolean))];
    const { data: actors } = ids.length
      ? await this.#db.from('onyx_users').select('id, name, email').in('id', ids)
      : { data: [] };
    const byId = new Map((actors ?? []).map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, actor: byId.get(Number(r.actor_id)) ?? null }));
  }
}
