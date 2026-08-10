/**
 * Onyx O01 -- authentication, tenants, members and the audit log.
 *
 * Every route here is mounted under /api/onyx so the Laravel port's routes and
 * Onyx's can never shadow each other (ADR-006).
 *
 * The tenant is ALWAYS taken from the caller's token, never from the path or
 * body. That is the whole isolation guarantee: there is no parameter to tamper
 * with, and the same id reaches the RLS policies through the JWT claim.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  validate, ok, HttpError,
  requireOnyx, requireOnyxRole, issueOnyxToken, ROLES,
} from '@onyx/core';
import type { Role } from '@onyx/types';
import type { AppContext } from '../../context.ts';

const asReq = (req: FastifyRequest) => ({
  headers: req.headers as Record<string, string | string[] | undefined>,
  cookies: (req as unknown as { cookies?: Record<string, string> }).cookies,
});

const idOf = (req: FastifyRequest) => Number((req.params as { id: string }).id);
const ipOf = (req: FastifyRequest) => (req as unknown as { ip?: string }).ip ?? null;

const RoleSchema = z.enum(ROLES as [Role, ...Role[]]);

export function registerOnyxTenancyRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---- F-03: sign in, and choose which institution to sign in to ----

  app.post('/api/onyx/auth/login', async (req) => {
    const body = validate(z.object({
      email: z.string().email(),
      password: z.string().min(1),
      tenant_id: z.number().int().positive().optional(),
    }), req.body);

    const result = await ctx.onyxTenancy.authenticate(body.email, body.password, body.tenant_id);
    const { token, expiresAt } = issueOnyxToken({
      userId: result.user.id,
      tenantId: Number(result.membership.tenant_id),
      tenantRole: result.membership.role as Role,
      email: result.user.email,
      secret: ctx.jwtSecret,
    });
    return ok({
      token,
      expires_at: expiresAt,
      user: result.user,
      tenant: result.membership.tenant,
      role: result.membership.role,
      // The switcher needs to know where else they belong.
      memberships: result.memberships.map((m) => ({
        tenant: m.tenant, role: m.role,
      })),
    });
  });

  /** F-06 -- move to another institution this person already belongs to. */
  app.post('/api/onyx/auth/switch', async (req) => {
    const claims = requireOnyx(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({ tenant_id: z.number().int().positive() }), req.body);

    const memberships = await ctx.onyxTenancy.membershipsFor(claims.user_id);
    const target = memberships.find((m) => Number(m.tenant_id) === body.tenant_id);
    // Switching is only ever between institutions they already belong to.
    if (!target) throw new HttpError(403, 'You do not belong to that institution.');

    const { token, expiresAt } = issueOnyxToken({
      userId: claims.user_id,
      tenantId: body.tenant_id,
      tenantRole: target.role as Role,
      email: claims.email,
      secret: ctx.jwtSecret,
    });
    return ok({ token, expires_at: expiresAt, tenant: target.tenant, role: target.role });
  });

  app.get('/api/onyx/me', async (req) => {
    const claims = requireOnyx(asReq(req), ctx.jwtSecret);
    const memberships = await ctx.onyxTenancy.membershipsFor(claims.user_id);
    return ok({
      user_id: claims.user_id,
      email: claims.email,
      role: claims.tenant_role,
      tenant: await ctx.onyxTenancy.tenant(claims.tenant_id),
      memberships: memberships.map((m) => ({ tenant: m.tenant, role: m.role })),
    });
  });

  // ---- F-06: onboarding a new institution ----

  /**
   * Deliberately unauthenticated: this is how the first institution comes into
   * existence, before anyone has a token for it. In production this sits behind
   * a signup gate or an operator console; the shape does not change.
   */
  app.post('/api/onyx/tenants', async (req) => {
    const body = validate(z.object({
      name: z.string().min(1).max(255),
      slug: z.string().max(255).optional(),
      plan: z.string().max(50).nullish(),
      admin: z.object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
        password: z.string().min(8).max(255),
      }),
    }), req.body);

    const { tenant, admin } = await ctx.onyxTenancy.createTenant(body);
    await ctx.onyxAudit.recordSystem(tenant!.id, {
      action: 'tenant.created', entityType: 'tenant', entityId: tenant!.id,
      after: { name: tenant!.name, slug: tenant!.slug }, ip: ipOf(req),
    });
    return ok({ tenant, admin: { id: admin.id, email: admin.email } },
      'Institution created.');
  });

  // ---- F-04: members ----

  app.get('/api/onyx/members', async (req) => {
    const claims = requireOnyxRole(asReq(req), ctx.jwtSecret, 'admin', 'faculty');
    const q = req.query as { role?: Role; search?: string };
    return ok(await ctx.onyxTenancy.members(claims.tenant_id, {
      role: q.role, search: q.search,
    }));
  });

  app.post('/api/onyx/members', async (req) => {
    const claims = requireOnyxRole(asReq(req), ctx.jwtSecret, 'admin');
    const body = validate(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      role: RoleSchema,
      password: z.string().min(8).max(255).optional(),
    }), req.body);

    const result = await ctx.onyxTenancy.invite(claims.tenant_id, body);
    await ctx.onyxAudit.record(claims, {
      action: 'membership.created', entityType: 'membership',
      entityId: result.membership.id,
      after: { user_id: result.user.id, role: body.role }, ip: ipOf(req),
    });
    return ok(result, 'Member added.');
  });

  app.patch('/api/onyx/members/:id', async (req) => {
    const claims = requireOnyxRole(asReq(req), ctx.jwtSecret, 'admin');
    const body = validate(z.object({ role: RoleSchema }), req.body);

    const change = await ctx.onyxTenancy.changeRole(claims.tenant_id, idOf(req), body.role);
    await ctx.onyxAudit.record(claims, {
      action: 'membership.role_changed', entityType: 'membership', entityId: idOf(req),
      before: { role: change.from }, after: { role: change.to }, ip: ipOf(req),
    });
    return ok(change, 'Role updated.');
  });

  app.delete('/api/onyx/members/:id', async (req) => {
    const claims = requireOnyxRole(asReq(req), ctx.jwtSecret, 'admin');
    const removed = await ctx.onyxTenancy.removeMember(claims.tenant_id, idOf(req));
    await ctx.onyxAudit.record(claims, {
      action: 'membership.removed', entityType: 'membership', entityId: idOf(req),
      before: removed, ip: ipOf(req),
    });
    return ok({}, 'Member removed.');
  });

  // ---- F-05: the audit log ----

  app.get('/api/onyx/audit', async (req) => {
    const claims = requireOnyxRole(asReq(req), ctx.jwtSecret, 'admin');
    const q = req.query as { action?: string; entity_type?: string; limit?: string };
    // Always this tenant's log. audit_logs has RLS with no select policy, so
    // this service-role path is the only way to read it at all.
    return ok(await ctx.onyxAudit.list(claims.tenant_id, {
      action: q.action,
      entityType: q.entity_type,
      limit: q.limit ? Number(q.limit) : undefined,
    }));
  });
}
