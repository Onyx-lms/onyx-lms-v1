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
import type { OnyxDb } from './db.ts';
import { HttpError } from '../http/errors.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { slugify } from '../authoring/slug.ts';

const TENANT_COLUMNS = 'id, name, slug, status, plan, created_at, updated_at';
const ADMIN_COLUMNS = 'id, user_id, granted_by, created_at';

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

    return { ...data, members_by_role: byRole };
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
