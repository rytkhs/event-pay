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

      if (url.pathname === "/debug-sentry") {
        const testType = url.searchParams.get("test");

        if (testType === "error") {
          throw new Error("My first Sentry error!");
        }

        if (testType === "trace") {
          return Sentry.startSpan(
            {
              op: "test",
              name: "My First Test Transaction",
            },
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for 100ms
              throw new Error("My first Sentry error in trace!");
            }
          );
        }

        return new Response("Sentry debug endpoint. Use ?test=error or ?test=trace");
      }

      return openNextWorker.fetch(request, env, ctx);
    },
  }
);
