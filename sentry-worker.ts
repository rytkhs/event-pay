import * as Sentry from "@sentry/cloudflare";

// @ts-ignore
import openNextWorker from "./.open-next/worker.js";

export default Sentry.withSentry(
  (env: any) => {
    return {
      dsn: env.SENTRY_DSN,
      release: env.SENTRY_RELEASE,
      sendDefaultPii: true,
      enableLogs: true,
      tracesSampleRate: 1.0,
    };
  },
  {
    async fetch(request: Request, env: any, ctx: any) {
      const url = new URL(request.url);
      return openNextWorker.fetch(request, env, ctx);
    },
  }
);
