import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { createContext } from './context.ts';
import { registerErrorHandler } from './plugins/error-handler.ts';
import { registerAuthRoutes } from './routes/auth.routes.ts';
import { registerAccountRoutes } from './routes/account.routes.ts';
import { registerUserRoutes } from './routes/users.routes.ts';
import { registerCatalogRoutes } from './routes/catalog.routes.ts';
import { registerAuthoringRoutes } from './routes/authoring.routes.ts';
import { registerMediaRoutes } from './routes/media.routes.ts';
import { registerQuizRoutes } from './routes/quiz.routes.ts';
import { registerEnrollmentRoutes } from './routes/enrollment.routes.ts';
import { registerPaymentRoutes } from './routes/payment.routes.ts';
import { registerOfflineRoutes } from './routes/offline.routes.ts';
import { registerPlayerRoutes } from './routes/player.routes.ts';
import { registerCommunityRoutes } from './routes/community.routes.ts';
import { registerReviewRoutes } from './routes/review.routes.ts';
import { registerAdminEnrollmentRoutes } from './routes/admin-enrollment.routes.ts';
import { registerBlogRoutes } from './routes/blog.routes.ts';
import { registerKnowledgeRoutes } from './routes/knowledge.routes.ts';
import { registerMessagingRoutes } from './routes/messaging.routes.ts';
import { registerLiveClassRoutes } from './routes/live-class.routes.ts';
import { registerBootcampRoutes } from './routes/bootcamp.routes.ts';
import { registerTeamRoutes } from './routes/team.routes.ts';
import { registerTutorRoutes } from './routes/tutor.routes.ts';
import { registerReportRoutes } from './routes/reports.routes.ts';
import { registerAdminSettingsRoutes } from './routes/admin-settings.routes.ts';
import { registerOnyxTenancyRoutes } from './routes/onyx/tenancy.routes.ts';
import { registerOnyxLearnRoutes } from './routes/onyx/learn.routes.ts';
import { registerOnyxCodeLabRoutes } from './routes/onyx/codelab.routes.ts';
import { registerPlatformRoutes } from './routes/platform.routes.ts';

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(cors, { origin: process.env.WEB_ORIGIN ?? true, credentials: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  // Webhook signatures are computed over the EXACT bytes the gateway sent.
  // Fastify's default JSON parser throws the raw string away, so re-serialising
  // req.body would fail every signature check. Keep the original alongside.
  app.addContentTypeParser('application/json', { parseAs: 'string' },
    (req, body, done) => {
      (req as unknown as { rawBody?: string }).rawBody = body as string;
      if (!body) return done(null, undefined);
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    });
  registerErrorHandler(app);

  const ctx = createContext();
  registerPlatformRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerAccountRoutes(app, ctx);
  registerUserRoutes(app, ctx);
  registerCatalogRoutes(app, ctx);
  registerAuthoringRoutes(app, ctx);
  registerMediaRoutes(app, ctx);
  registerQuizRoutes(app, ctx);
  registerEnrollmentRoutes(app, ctx);
  registerPaymentRoutes(app, ctx);
  registerOfflineRoutes(app, ctx);
  registerPlayerRoutes(app, ctx);
  registerCommunityRoutes(app, ctx);
  registerReviewRoutes(app, ctx);
  registerAdminEnrollmentRoutes(app, ctx);
  registerBlogRoutes(app, ctx);
  registerKnowledgeRoutes(app, ctx);
  registerMessagingRoutes(app, ctx);
  registerLiveClassRoutes(app, ctx);
  registerBootcampRoutes(app, ctx);
  registerTeamRoutes(app, ctx);
  registerTutorRoutes(app, ctx);
  registerReportRoutes(app, ctx);
  registerAdminSettingsRoutes(app, ctx);
  registerOnyxTenancyRoutes(app, ctx);
  registerOnyxLearnRoutes(app, ctx);
  registerOnyxCodeLabRoutes(app, ctx);

  // The worker interval below needs the same context the routes use --
  // building a second one would mean a second connection pool.
  (app as unknown as { ctx: typeof ctx }).ctx = ctx;
  return app;
}

// Only boot when executed directly, so tests can import buildServer freely.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const port = Number(process.env.PORT ?? 4000);
  const app = await buildServer();
  app.listen({ port, host: '0.0.0.0' })
    .catch((err) => { app.log.error(err); process.exit(1); });

  // LAB-02b. The Code Lab worker runs in-process on an interval: one deployable
  // is worth more than a second one nobody remembers to start, and the queue is
  // durable either way. Splitting it into its own process later changes only
  // this block.
  //
  // unref() so a pending tick never holds the process open on shutdown.
  const everyMs = Number(process.env.ONYX_WORKER_INTERVAL_MS ?? 2000);
  if (everyMs > 0) {
    const ctx = (app as unknown as { ctx: { onyxRunWorker: (o?: {
      concurrency?: number;
    }) => Promise<unknown> } }).ctx;
    let running = false;
    setInterval(() => {
      // Skip rather than overlap. Two passes at once would claim different jobs
      // -- SKIP LOCKED makes that safe -- but the pool is small and throughput
      // is not the problem the interval is solving.
      if (running) return;
      running = true;
      void ctx.onyxRunWorker({ concurrency: Number(process.env.ONYX_WORKER_CONCURRENCY ?? 4) })
        .catch((err) => app.log.error({ err }, 'onyx worker pass failed'))
        .finally(() => { running = false; });
    }, everyMs).unref();
  }
}
