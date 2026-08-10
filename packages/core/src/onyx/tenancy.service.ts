/**
 * F-04 / F-06 -- tenants, people and the membership that binds them.
 *
 * A `user` is an identity: one email, one password, across the whole platform.
 * A `membership` is what that identity IS inside one institution. Roles live on
 * the membership, so the same person can be a student at one and faculty at
 * another without either institution seeing the other.
 */
import type { OnyxDb } from './db.ts';
import type { Role } from '@onyx/types';
import { HttpError } from '../http/errors.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { slugify } from '../authoring/slug.ts';

const TENANT_COLUMNS = 'id, name, slug, status, plan, created_at, updated_at';
const USER_COLUMNS = 'id, email, name, phone, photo, status, email_verified_at, created_at';
const MEMBERSHIP_COLUMNS = 'id, tenant_id, user_id, role, status, created_at';

export const ROLES: Role[] = ['student', 'faculty', 'exams', 'placement', 'employer', 'admin'];

export class TenancyService {
  #db: OnyxDb;
  constructor(db: OnyxDb) { this.#db = db; }

  // ---- tenants ----

  async tenant(id: number) {
    const { data } = await this.#db.from('onyx_tenants')
      .select(TENANT_COLUMNS).eq('id', id).maybeSingle();
    if (!data) throw new HttpError(404, 'Institution not found.');
    return data;
  }

  async tenantBySlug(slug: string) {
    const { data } = await this.#db.from('onyx_tenants')
      .select(TENANT_COLUMNS).eq('slug', slug.trim().toLowerCase()).maybeSingle();
    return data ?? null;
  }

  /**
   * F-06 -- stand up an institution and its first administrator in one step.
   *
   * An institution with no admin is unusable and nobody can fix it from inside,
   * so the two are created together rather than left to a follow-up call.
   */
  async createTenant(input: {
    name: string; slug?: string; plan?: string | null;
    admin: { name: string; email: string; password: string };
  }) {
    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw new HttpError(422, 'That name does not make a usable address.');
    if (await this.tenantBySlug(slug)) {
      throw new HttpError(422, 'An institution with that address already exists.');
    }

    const { data: tenant, error } = await this.#db.from('onyx_tenants').insert({
      name: input.name.trim(), slug, status: 1, plan: input.plan ?? null,
    }).select(TENANT_COLUMNS).maybeSingle();
    // Two simultaneous signups for the same address get past the check above
    // and collide on the unique constraint. That is the caller's answer, not a
    // server fault, so it reads the same either way.
    if (error?.code === '23505') {
      throw new HttpError(422, 'An institution with that address already exists.');
    }
    if (error) throw new HttpError(500, 'Could not create the institution: ' + error.message);

    const admin = await this.upsertUser({
      name: input.admin.name, email: input.admin.email, password: input.admin.password,
    });
    await this.addMember(tenant!.id, admin.id, 'admin');
    return { tenant, admin };
  }

  // ---- people ----

  async userByEmail(email: string) {
    const { data } = await this.#db.from('onyx_users')
      .select('id, email, name, password, status')
      .eq('email', email.trim().toLowerCase()).maybeSingle();
    return data ?? null;
  }

  /**
   * Finds or creates the identity behind an email.
   *
   * Inviting someone who already has an account must attach them, not create a
   * second identity with the same address -- that is how one person ends up
   * unable to see half their institutions.
   */
  async upsertUser(input: { name: string; email: string; password?: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.userByEmail(email);
    if (existing) return existing;

    const { data, error } = await this.#db.from('onyx_users').insert({
      email,
      name: input.name.trim(),
      password: input.password ? await hashPassword(input.password) : null,
      status: 1,
    }).select('id, email, name, password, status').maybeSingle();
    if (error) throw new HttpError(500, 'Could not create the account: ' + error.message);
    return data!;
  }

  // ---- memberships ----

  async membership(tenantId: number, userId: number) {
    const { data } = await this.#db.from('onyx_memberships')
      .select(MEMBERSHIP_COLUMNS)
      .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
    return data ?? null;
  }

  /** Every institution this person belongs to, for the tenant switcher. */
  async membershipsFor(userId: number) {
    const { data } = await this.#db.from('onyx_memberships')
      .select(MEMBERSHIP_COLUMNS).eq('user_id', userId).eq('status', 1);
    const rows = data ?? [];
    if (!rows.length) return [];

    const ids = [...new Set(rows.map((r) => Number(r.tenant_id)))];
    const { data: tenants } = await this.#db.from('onyx_tenants')
      .select(TENANT_COLUMNS).in('id', ids).eq('status', 1);
    const byId = new Map((tenants ?? []).map((t) => [t.id, t]));
    // A membership of a suspended institution is not a way in.
    return rows
      .filter((r) => byId.has(Number(r.tenant_id)))
      .map((r) => ({ ...r, tenant: byId.get(Number(r.tenant_id))! }));
  }

  async addMember(tenantId: number, userId: number, role: Role) {
    if (!ROLES.includes(role)) throw new HttpError(422, 'That is not a role.');
    const existing = await this.membership(tenantId, userId);
    if (existing) throw new HttpError(422, 'They are already a member of this institution.');

    const { data, error } = await this.#db.from('onyx_memberships')
      .insert({ tenant_id: tenantId, user_id: userId, role, status: 1 })
      .select(MEMBERSHIP_COLUMNS).maybeSingle();
    if (error) throw new HttpError(500, 'Could not add them: ' + error.message);
    return data!;
  }

  /** F-06 -- invite by email, creating the identity if it is new. */
  async invite(tenantId: number, input: {
    name: string; email: string; role: Role; password?: string;
  }) {
    const user = await this.upsertUser(input);
    const membership = await this.addMember(tenantId, user.id, input.role);
    return { user: { id: user.id, email: user.email, name: user.name }, membership };
  }

  async members(tenantId: number, filters: { role?: Role; search?: string } = {}) {
    let query = this.#db.from('onyx_memberships')
      .select(MEMBERSHIP_COLUMNS).eq('tenant_id', tenantId);
    if (filters.role) query = query.eq('role', filters.role);
    const { data } = await query.order('id');
    const rows = data ?? [];
    if (!rows.length) return [];

    const ids = [...new Set(rows.map((r) => Number(r.user_id)))];
    const { data: users } = await this.#db.from('onyx_users').select(USER_COLUMNS).in('id', ids);
    const byId = new Map((users ?? []).map((u) => [u.id, u]));

    let out = rows.map((r) => ({ ...r, user: byId.get(Number(r.user_id)) ?? null }));
    if (filters.search?.trim()) {
      const needle = filters.search.trim().toLowerCase();
      out = out.filter((r) =>
        (r.user?.name ?? '').toLowerCase().includes(needle)
        || (r.user?.email ?? '').toLowerCase().includes(needle));
    }
    return out;
  }

  async changeRole(tenantId: number, membershipId: number, role: Role) {
    if (!ROLES.includes(role)) throw new HttpError(422, 'That is not a role.');
    const current = await this.#findMembership(tenantId, membershipId);

    if (current.role === 'admin' && role !== 'admin') {
      await this.#assertNotLastAdmin(tenantId, membershipId);
    }
    await this.#db.from('onyx_memberships')
      .update({ role, updated_at: new Date().toISOString() }).eq('id', membershipId);
    return { id: membershipId, from: current.role as Role, to: role };
  }

  async removeMember(tenantId: number, membershipId: number): Promise<{ user_id: number }> {
    const current = await this.#findMembership(tenantId, membershipId);
    if (current.role === 'admin') await this.#assertNotLastAdmin(tenantId, membershipId);
    await this.#db.from('onyx_memberships').delete().eq('id', membershipId);
    return { user_id: Number(current.user_id) };
  }

  /** Sign-in for one institution. Returns the membership that authorises it. */
  async authenticate(email: string, password: string, tenantId?: number) {
    const user = await this.userByEmail(email);
    // The same message either way: which emails exist is not public.
    if (!user || !user.password) throw new HttpError(401, 'Those details do not match.');
    if (!(await verifyPassword(password, user.password))) {
      throw new HttpError(401, 'Those details do not match.');
    }
    if (user.status !== 1) throw new HttpError(403, 'That account is not active.');

    const memberships = await this.membershipsFor(user.id);
    if (!memberships.length) {
      throw new HttpError(403, 'That account does not belong to an institution yet.');
    }
    const chosen = tenantId
      ? memberships.find((m) => Number(m.tenant_id) === tenantId)
      : memberships[0];
    if (!chosen) throw new HttpError(403, 'You do not belong to that institution.');

    return {
      user: { id: user.id, email: user.email, name: user.name },
      membership: chosen,
      memberships,
    };
  }

  async #findMembership(tenantId: number, membershipId: number) {
    const { data } = await this.#db.from('onyx_memberships')
      .select(MEMBERSHIP_COLUMNS).eq('id', membershipId).maybeSingle();
    // Scoped to the caller's tenant: an id from another institution is a 404,
    // not a 403, because its existence is not the caller's business.
    if (!data || Number(data.tenant_id) !== tenantId) {
      throw new HttpError(404, 'Member not found.');
    }
    return data;
  }

  /**
   * An institution with no administrator cannot be recovered from inside it, so
   * the last one cannot demote or delete themselves.
   */
  async #assertNotLastAdmin(tenantId: number, membershipId: number): Promise<void> {
    const { data } = await this.#db.from('onyx_memberships')
      .select('id').eq('tenant_id', tenantId).eq('role', 'admin').eq('status', 1);
    const admins = (data ?? []).map((m) => m.id);
    if (admins.length <= 1 && admins.includes(membershipId)) {
      throw new HttpError(422, 'This is the only administrator. Appoint another first.');
    }
  }
}
