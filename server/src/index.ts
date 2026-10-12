// Faithly Worker: serves the PWA (static assets, SPA fallback) and the small push API,
// and sends due daily reminders from a Cron Trigger.
import { handleApi } from './api.ts';
import { cleanup, dispatchDue } from './dispatch.ts';
import type { Env } from './env.ts';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    const summary = await dispatchDue(env);
    if (summary.due) console.log('reminders', JSON.stringify(summary));
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
