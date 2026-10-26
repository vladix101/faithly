// Faithly Worker: serves the PWA (static assets, SPA fallback) and the small push API,
// and sends due daily reminders and feast/fast notices from a Cron Trigger.
import { handleApi } from './api.ts';
import { cleanup, dispatchDue, dispatchNotices } from './dispatch.ts';
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
    const notices = await dispatchNotices(env);
    if (notices.due) console.log('notices', JSON.stringify(notices));
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
