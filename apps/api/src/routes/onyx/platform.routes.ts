/**
 * The platform console -- create, list and suspend institutions; grant and
 * revoke who else can.
 *
 * Every route here uses requirePlatformAdmin(), never requireOnyx() or
 * requireOnyxRole(). That is not a style choice: a tenant token cannot pass
 * requirePlatformAdmin() (it has no `platform` claim) and a platform token
 * cannot pass requireOnyx() (it has no `tenant_id`), so the two surfaces
 * cannot be confused for each other by a route registered in the wrong file.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { validate, ok, requirePlatformAdmin, issuePlatformToken } from '@onyx/core';
import type { AppContext } from '../../context.ts';

const asReq = (req: FastifyRequest) => ({
  headers: req.headers as Record<string, string | string[] | undefined>,
  cookies: (req as unknown as { cookies?: Record<string, string> }).cookies,
});

const idOf = (req: FastifyRequest) => Number((req.params as { id: string }).id);

export function registerOnyxPlatformRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/onyx/platform/login', async (req) => {
    const body = validate(z.object({
      email: z.string().email(), password: z.string().min(1),
    }), req.body);
    const result = await ctx.onyxPlatform.authenticate(body.email, body.password);
    const { token, expiresAt } = issuePlatformToken({
      userId: result.user.id, email: result.user.email, secret: ctx.jwtSecret,
    });
    return ok({ token, expires_at: expiresAt, user: result.user });
  });

  app.get('/api/onyx/platform/me', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok({ user_id: claims.user_id, email: claims.email });
  });

  app.get('/api/onyx/platform/tenants', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.tenants());
  });

  app.get('/api/onyx/platform/tenants/:id', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.tenant(idOf(req)));
  });

  // The drill-in reads. Same guard as everything else in this file: a tenant
  // token has no `platform` claim, so it cannot reach an institution it does
  // not belong to through here -- and a platform token has no `tenant_id`, so
  // it cannot reach the tenant surface either. `:id` scopes every query.
  app.get('/api/onyx/platform/tenants/:id/people', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const q = validate(z.object({
      role: z.enum(['student', 'faculty', 'exams', 'placement', 'employer', 'admin', 'guardian'])
        .optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }), req.query ?? {});
    return ok(await ctx.onyxPlatform.tenantPeople(idOf(req), q));
  });

  app.get('/api/onyx/platform/tenants/:id/academics', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const q = validate(z.object({
      limit: z.coerce.number().int().positive().max(200).optional(),
    }), req.query ?? {});
    return ok(await ctx.onyxPlatform.tenantAcademics(idOf(req), q));
  });

  // Audited in the service, not here: the log entry belongs next to the read it
  // describes, so no future caller can reach the data around the logging.
  app.get('/api/onyx/platform/tenants/:id/grades', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const q = validate(z.object({
      limit: z.coerce.number().int().positive().max(200).optional(),
    }), req.query ?? {});
    return ok(await ctx.onyxPlatform.tenantGrades(idOf(req), claims.user_id, q));
  });

  app.post('/api/onyx/platform/tenants', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
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
    return ok(await ctx.onyxPlatform.createTenant(body, claims.user_id), 'Institution created.');
  });

  app.post('/api/onyx/platform/tenants/:id/suspend', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.suspend(idOf(req), claims.user_id), 'Suspended.');
  });

  app.post('/api/onyx/platform/tenants/:id/activate', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.activate(idOf(req), claims.user_id), 'Activated.');
  });

  app.get('/api/onyx/platform/admins', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.admins());
  });

  app.post('/api/onyx/platform/admins', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      email: z.string().email(),
      name: z.string().min(1).max(255).optional(),
      password: z.string().min(8).max(255).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.grant(
      body.email, body.name ?? body.email, body.password ?? null, claims.user_id),
      'Granted.');
  });

  app.delete('/api/onyx/platform/admins/:id', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.revoke(idOf(req), claims.user_id), 'Revoked.');
  });

  app.get('/api/onyx/platform/audit', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const q = req.query as { limit?: string };
    return ok(await ctx.onyxPlatform.auditLog({ limit: q.limit ? Number(q.limit) : undefined }));
  });
}
