import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { z } from "zod";

import { ga4Server } from "@core/analytics/ga4-server";
import { respondWithCode, respondWithProblem } from "@core/errors/adapters/http-adapter";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";

const API_INSTANCE = "/api/analytics/ga4-exception";

const exceptionEventSchema = z.object({
  description: z.string().min(1).max(500),
  fatal: z.boolean(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return respondWithCode("INVALID_JSON", {
      instance: API_INSTANCE,
      detail: "Invalid JSON in request body",
      logContext: {
        category: "system",
        action: "ga4_exception_invalid_json",
        actorType: "anonymous",
        additionalData: {
          error_message: error instanceof Error ? error.message : String(error),
        },
      },
    });
  }

  const parsed = exceptionEventSchema.safeParse(body);
  if (!parsed.success) {
    return respondWithCode("VALIDATION_ERROR", {
      instance: API_INSTANCE,
      detail: "Invalid request body",
      logContext: {
        category: "system",
        action: "ga4_exception_invalid_request",
        actorType: "anonymous",
      },
    });
  }

  try {
    const cookieStore = await cookies();
    const clientId = extractClientIdFromGaCookie(cookieStore.get("_ga")?.value);

    await ga4Server.sendEvent(
      {
        name: "exception",
        params: parsed.data,
      },
      clientId ?? undefined
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respondWithProblem(error, {
      instance: API_INSTANCE,
      defaultCode: "GA4_TRACKING_FAILED",
      logContext: {
        category: "system",
        action: "ga4_exception_tracking",
        actorType: "anonymous",
      },
    });
  }
}
