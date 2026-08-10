/** Sprint-1 platform endpoints: settings, i18n dictionary, health. */
import type { FastifyInstance } from 'fastify';
import { ok, notFound } from '@onyx/core';
import type { AppContext } from '../context.ts';

export function registerPlatformRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/health', async () => ok({ status: 'up', ts: new Date().toISOString() }));

  /** Curated public settings only -- see SettingsService.PUBLIC_KEYS. */
  app.get('/api/settings', async () => ok(await ctx.settings.publicSettings()));

  app.get('/api/settings/theme', async () => ok({ theme: await ctx.settings.theme() }));

  app.get('/api/languages', async () => ok(await ctx.i18n.languages()));

  /** Full phrase dictionary for a language -- feeds next-intl on the web side. */
  app.get<{ Params: { language: string } }>(
    '/api/i18n/:language',
    async (req) => {
      const dict = await ctx.i18n.dictionary(req.params.language);
      if (Object.keys(dict).length === 0) {
        const known = await ctx.i18n.findLanguage(req.params.language);
        if (!known) throw notFound(`Unknown language "${req.params.language}".`);
      }
      return ok({
        language: req.params.language,
        direction: await ctx.i18n.direction(req.params.language),
        phrases: dict,
      });
    },
  );
}
