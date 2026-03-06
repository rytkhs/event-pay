import "server-only";

import { cookies } from "next/headers";

import { logger } from "@core/logging/app-logger";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";

type AuthTelemetryEvent =
  | {
      name: "login" | "sign_up";
      userId?: string;
      method: "password";
    }
  | {
      name: "logout";
      userId?: string;
    };

const GA4_FAILURE_ACTION: Record<AuthTelemetryEvent["name"], string> = {
  login: "ga4LoginEventFailed",
  sign_up: "ga4SignUpEventFailed",
  logout: "ga4LogoutEventFailed",
};

export function trackAuthEvent(event: AuthTelemetryEvent): void {
  waitUntil(
    (async () => {
      try {
        const { ga4Server } = await import("@core/analytics/ga4-server");

        const cookieStore = await cookies();
        const gaCookie = cookieStore.get("_ga")?.value;
        const clientId = extractClientIdFromGaCookie(gaCookie);

        if (event.name === "logout") {
          await ga4Server.sendEvent(
            {
              name: "logout",
              params: {},
            },
            clientId ?? undefined,
            event.userId,
            undefined,
            undefined
          );
        } else {
          await ga4Server.sendEvent(
            {
              name: event.name,
              params: {
                method: event.method,
              },
            },
            clientId ?? undefined,
            event.userId,
            undefined,
            undefined
          );
        }
      } catch (error) {
        logger.debug(`[GA4] Failed to send ${event.name} event`, {
          category: "system",
          action: GA4_FAILURE_ACTION[event.name],
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    })()
  );
}
