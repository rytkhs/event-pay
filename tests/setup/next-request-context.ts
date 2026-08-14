import { parseSetCookie, type ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { actionAsyncStorage } from "next/dist/server/app-render/action-async-storage.external";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { createWorkStore } from "next/dist/server/async-storage/work-store";
import { NextRequest } from "next/server";

/**
 * Next.js 15.5 は Server Action 用の公開テストハーネスを提供していない。
 * 非公開APIへの依存はこのファイルだけに閉じ込め、カナリーテストで互換性を検知する。
 */

export type NextRequestTestCookie = {
  name: string;
  value: string;
};

export type NextResponseTestCookie = ResponseCookie;

export type NextServerActionContextOptions = {
  cookies?: NextRequestTestCookie[];
  url?: string;
};

export type NextServerActionExecution<TResult> = {
  result: TResult;
  responseCookies: NextResponseTestCookie[];
  revalidatedTags: string[];
};

const DEFAULT_REQUEST_URL = "http://localhost/test-server-action";

function serializeRequestCookies(cookies: NextRequestTestCookie[]): string {
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function runInNextServerActionContext<TResult>(
  options: NextServerActionContextOptions,
  action: () => Promise<TResult> | TResult
): Promise<NextServerActionExecution<TResult>> {
  const url = options.url ?? DEFAULT_REQUEST_URL;
  const headers = new Headers();
  const requestCookies = options.cookies ?? [];

  if (requestCookies.length > 0) {
    headers.set("cookie", serializeRequestCookies(requestCookies));
  }

  const request = new NextRequest(url, { headers, method: "POST" });
  const implicitTags = {
    tags: [],
    expirationsByCacheKind: new Map(),
  };
  const responseSetCookieHeaders: string[] = [];
  const requestStore = createRequestStoreForAPI(
    request,
    request.nextUrl,
    implicitTags,
    (cookies) => responseSetCookieHeaders.push(...cookies),
    undefined
  );
  const workStore = createWorkStore({
    page: "/test-server-action/page",
    renderOpts: {
      dev: false,
      experimental: {
        authInterrupts: false,
        cacheComponents: false,
        isRoutePPREnabled: false,
      },
      incrementalCache: {} as Parameters<
        typeof createWorkStore
      >[0]["renderOpts"]["incrementalCache"],
      isPossibleServerAction: true,
      onAfterTaskError: undefined,
      onClose: (callback) => callback(),
      supportsDynamicResponse: true,
      waitUntil: undefined,
    },
    buildId: "vitest",
    previouslyRevalidatedTags: [],
  });

  const result = await actionAsyncStorage.run({ isAction: true }, async () =>
    workUnitAsyncStorage.run(requestStore, async () =>
      workAsyncStorage.run(workStore, async () => await action())
    )
  );
  const responseCookiesByName = new Map<string, ResponseCookie>();
  for (const header of responseSetCookieHeaders) {
    const cookie = parseSetCookie(header);
    if (cookie) responseCookiesByName.set(cookie.name, cookie);
  }

  return {
    result,
    responseCookies: [...responseCookiesByName.values()],
    revalidatedTags: [...(workStore.pendingRevalidatedTags ?? [])],
  };
}
