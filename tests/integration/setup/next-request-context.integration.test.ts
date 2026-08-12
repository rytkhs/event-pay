import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { describe, expect } from "vitest";

import { test } from "../../fixtures/test";
import { runInNextServerActionContext } from "../../setup/next-request-context";

describe("Next.js Server Action request context", () => {
  test("cookiesの読み書きとpath revalidationを観測できる", async () => {
    const execution = await runInNextServerActionContext(
      {
        cookies: [{ name: "request-cookie", value: "before" }],
        url: "http://localhost/dashboard",
      },
      async () => {
        const cookieStore = await cookies();
        const requestCookie = cookieStore.get("request-cookie")?.value;

        cookieStore.set("response-cookie", "after", {
          httpOnly: true,
          path: "/",
          sameSite: "lax",
        });
        revalidatePath("/(app)", "layout");

        return requestCookie;
      }
    );

    expect(execution.result).toBe("before");
    expect(execution.responseCookies).toContainEqual(
      expect.objectContaining({
        name: "response-cookie",
        value: "after",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
      })
    );
    expect(execution.revalidatedTags).toContain("_N_T_/(app)/layout");
  });

  test("並行実行したrequest間でcookieを共有しない", async () => {
    const execute = async (value: string) =>
      await runInNextServerActionContext({ cookies: [{ name: "isolated", value }] }, async () => {
        await Promise.resolve();
        const cookieStore = await cookies();
        cookieStore.set("written", value);
        return cookieStore.get("isolated")?.value;
      });

    const [first, second] = await Promise.all([execute("first"), execute("second")]);

    expect(first.result).toBe("first");
    expect(first.responseCookies).toContainEqual(
      expect.objectContaining({ name: "written", value: "first" })
    );
    expect(second.result).toBe("second");
    expect(second.responseCookies).toContainEqual(
      expect.objectContaining({ name: "written", value: "second" })
    );
  });

  test("例外終了したrequestの状態を次のrequestへ残さない", async () => {
    await expect(
      runInNextServerActionContext(
        { cookies: [{ name: "leaked", value: "must-not-leak" }] },
        async () => {
          const cookieStore = await cookies();
          cookieStore.set("written-before-error", "must-not-leak");
          throw new Error("request failed");
        }
      )
    ).rejects.toThrow("request failed");

    const nextExecution = await runInNextServerActionContext({}, async () => {
      const cookieStore = await cookies();
      return {
        requestCookie: cookieStore.get("leaked")?.value ?? null,
        responseCookie: cookieStore.get("written-before-error")?.value ?? null,
      };
    });

    expect(nextExecution.result).toEqual({ requestCookie: null, responseCookie: null });
    expect(nextExecution.responseCookies).toEqual([]);
  });
});
