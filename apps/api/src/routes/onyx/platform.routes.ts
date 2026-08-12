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
import { validate, ok, requirePlatformAdmin, issuePlatformToken, ROLES } from '@onyx/core';
import type { Role } from '@onyx/types';
import type { AppContext } from '../../context.ts';

const asReq = (req: FastifyRequest) => ({
  headers: req.headers as Record<string, string | string[] | undefined>,
  cookies: (req as unknown as { cookies?: Record<string, string> }).cookies,
});

const idOf = (req: FastifyRequest) => Number((req.params as { id: string }).id);
const subIdOf = (req: FastifyRequest, key: string) =>
  Number((req.params as Record<string, string>)[key]);
const RoleSchema = z.enum(ROLES as [Role, ...Role[]]);

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
    const q = validate(z.object({
      search: z.string().max(255).optional(),
      status: z.coerce.number().int().min(0).max(1).optional(),
      plan: z.string().max(50).optional(),
    }), req.query ?? {});
    return ok(await ctx.onyxPlatform.tenants(q));
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

  // -------------------------------------------------------------------------
  // Editing inside an institution. Same guard, same tenant_id-as-boundary
  // rule as every read above -- see PlatformService's own comment on this.
  // -------------------------------------------------------------------------

  app.patch('/api/onyx/platform/tenants/:id', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      name: z.string().min(1).max(255).optional(),
      slug: z.string().max(255).optional(),
      plan: z.string().max(50).nullish(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateTenant(idOf(req), claims.user_id, body), 'Updated.');
  });

  app.delete('/api/onyx/platform/tenants/:id', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({ confirm_name: z.string().min(1) }), req.body);
    return ok(await ctx.onyxPlatform.deleteTenant(idOf(req), claims.user_id, body.confirm_name),
      'Institution deleted.');
  });

  app.post('/api/onyx/platform/tenants/:id/members', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      role: RoleSchema,
      password: z.string().min(8).max(255).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.addMember(idOf(req), claims.user_id, body), 'Member added.');
  });

  app.delete('/api/onyx/platform/tenants/:id/members/:memberId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.removeMember(
      idOf(req), subIdOf(req, 'memberId'), claims.user_id), 'Member removed.');
  });

  app.post('/api/onyx/platform/tenants/:id/courses', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      code: z.string().min(1).max(50),
      title: z.string().min(1).max(255),
      credits: z.number().int().min(0).optional(),
      self_enroll: z.boolean().optional(),
      status: z.number().int().min(0).max(1).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.createCourse(idOf(req), claims.user_id, body), 'Course created.');
  });

  app.post('/api/onyx/platform/tenants/:id/assignments', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      course_id: z.number().int().positive(),
      title: z.string().min(1).max(255),
      due_at: z.string().nullish(),
      total_points: z.number().min(0).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.createAssignment(idOf(req), claims.user_id, body),
      'Assignment created.');
  });

  app.post('/api/onyx/platform/tenants/:id/assessments', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      course_id: z.number().int().positive().nullish(),
      title: z.string().min(1).max(255),
      opens_at: z.string().nullish(),
      closes_at: z.string().nullish(),
      duration_minutes: z.number().int().min(1).max(1440).optional(),
      pass_mark: z.number().min(0).nullish(),
    }), req.body);
    return ok(await ctx.onyxPlatform.createAssessment(idOf(req), claims.user_id, body),
      'Assessment created.');
  });

  app.post('/api/onyx/platform/tenants/:id/exams', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      semester_id: z.number().int().positive(),
      course_id: z.number().int().positive(),
      title: z.string().min(1).max(255),
      starts_at: z.string(),
      duration_minutes: z.number().int().min(5).max(600).optional(),
      max_marks: z.number().min(1).max(1000).optional(),
      pass_marks: z.number().min(0).max(1000).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.createExam(idOf(req), claims.user_id, body), 'Exam scheduled.');
  });

  app.get('/api/onyx/platform/tenants/:id/semesters', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.tenantSemesters(idOf(req)));
  });

  app.get('/api/onyx/platform/tenants/:id/fees', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.tenantFees(idOf(req)));
  });

  app.post('/api/onyx/platform/tenants/:id/fee-heads', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      code: z.string().min(1).max(40),
      name: z.string().min(1).max(255),
      category: z.enum(['tuition', 'exam', 'hostel', 'transport', 'library', 'misc']).optional(),
      refundable: z.boolean().optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.createFeeHead(idOf(req), claims.user_id, body),
      'Fee head created.');
  });

  app.post('/api/onyx/platform/tenants/:id/fee-structures', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      name: z.string().min(1).max(255),
      instalments: z.number().int().min(1).max(12).optional(),
      currency: z.string().max(10).optional(),
      lines: z.array(z.object({
        head_id: z.number().int().positive(),
        amount_minor: z.number().int().min(0),
      })).min(1),
    }), req.body);
    return ok(await ctx.onyxPlatform.createFeeStructure(idOf(req), claims.user_id, body),
      'Fee structure created.');
  });

  app.post('/api/onyx/platform/tenants/:id/fee-structures/:structureId/status', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      status: z.enum(['draft', 'published', 'archived']),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateFeeStructureStatus(
      idOf(req), subIdOf(req, 'structureId'), claims.user_id, body.status), 'Updated.');
  });

  app.patch('/api/onyx/platform/tenants/:id/members/:memberId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      name: z.string().min(1).max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(50).nullish(),
      account_status: z.number().int().min(0).max(1).optional(),
      role: RoleSchema.optional(),
      membership_status: z.number().int().min(0).max(1).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateMember(
      idOf(req), subIdOf(req, 'memberId'), claims.user_id, body), 'Member updated.');
  });

  app.patch('/api/onyx/platform/tenants/:id/exam-marks/:markId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      raw_marks: z.number().min(0).optional(),
      final_marks: z.number().min(0).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateExamMark(
      idOf(req), subIdOf(req, 'markId'), claims.user_id, body), 'Mark updated.');
  });

  app.patch('/api/onyx/platform/tenants/:id/attempts/:attemptId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({ score: z.number().min(0) }), req.body);
    return ok(await ctx.onyxPlatform.updateAssessmentAttemptScore(
      idOf(req), subIdOf(req, 'attemptId'), claims.user_id, body.score), 'Score updated.');
  });

  app.get('/api/onyx/platform/tenants/:id/attempts/:attemptId', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.assessmentAttempt(idOf(req), subIdOf(req, 'attemptId')));
  });

  app.get('/api/onyx/platform/tenants/:id/submissions/:submissionId', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.submission(idOf(req), subIdOf(req, 'submissionId')));
  });

  app.patch('/api/onyx/platform/tenants/:id/submissions/:submissionId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      score: z.number().min(0).optional(),
      feedback: z.string().max(4000).nullish(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateSubmissionGrade(
      idOf(req), subIdOf(req, 'submissionId'), claims.user_id, body), 'Grade updated.');
  });

  app.get('/api/onyx/platform/tenants/:id/assignments/:assignmentId/submissions', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.assignmentSubmissions(idOf(req), subIdOf(req, 'assignmentId')));
  });

  app.patch('/api/onyx/platform/tenants/:id/courses/:courseId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      title: z.string().min(1).max(255).optional(),
      code: z.string().min(1).max(50).optional(),
      credits: z.number().int().min(0).optional(),
      status: z.number().int().min(0).max(1).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateCourse(
      idOf(req), subIdOf(req, 'courseId'), claims.user_id, body), 'Updated.');
  });

  app.patch('/api/onyx/platform/tenants/:id/assignments/:assignmentId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      title: z.string().min(1).max(255).optional(),
      due_at: z.string().nullish(),
      total_points: z.number().min(0).optional(),
      status: z.string().max(20).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateAssignment(
      idOf(req), subIdOf(req, 'assignmentId'), claims.user_id, body), 'Updated.');
  });

  app.patch('/api/onyx/platform/tenants/:id/exams/:examId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      title: z.string().min(1).max(255).optional(),
      starts_at: z.string().nullish(),
      duration_minutes: z.number().int().min(0).optional(),
      max_marks: z.number().min(0).optional(),
      pass_marks: z.number().min(0).optional(),
      status: z.string().max(20).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateExam(
      idOf(req), subIdOf(req, 'examId'), claims.user_id, body), 'Updated.');
  });

  app.patch('/api/onyx/platform/tenants/:id/assessments/:assessmentId', async (req) => {
    const claims = requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    const body = validate(z.object({
      title: z.string().min(1).max(255).optional(),
      opens_at: z.string().nullish(),
      closes_at: z.string().nullish(),
      pass_mark: z.number().min(0).nullish(),
      duration_minutes: z.number().int().min(0).optional(),
      status: z.string().max(20).optional(),
    }), req.body);
    return ok(await ctx.onyxPlatform.updateAssessment(
      idOf(req), subIdOf(req, 'assessmentId'), claims.user_id, body), 'Updated.');
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
    const q = req.query as { limit?: string; action?: string; entity_type?: string };
    return ok(await ctx.onyxPlatform.auditLog({
      limit: q.limit ? Number(q.limit) : undefined,
      action: q.action || undefined,
      entityType: q.entity_type || undefined,
    }));
  });

  app.get('/api/onyx/platform/audit/filters', async (req) => {
    requirePlatformAdmin(asReq(req), ctx.jwtSecret);
    return ok(await ctx.onyxPlatform.auditFilterOptions());
  });
}
