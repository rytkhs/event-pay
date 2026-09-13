import { describe, expect, vi } from "vitest";

import { updateGuestAttendanceAction as updateGuestAttendanceFeature } from "@features/guest/server";

import { updateGuestAttendanceAction } from "@/app/guest/[token]/actions";

import { test } from "../../fixtures/test";
import { runInNextServerActionContext } from "../../setup/next-request-context";

function createInvalidTokenFormData(): FormData {
  const formData = new FormData();
  formData.set("guestToken", "gst_12345678901234567890123456789012");
  formData.set("attendanceStatus", "attending");
  formData.set("paymentMethod", "cash");
  return formData;
}

function hasInvalidTokenLog(
  calls: ReadonlyArray<readonly unknown[]>,
  expected: { ip: string; userAgent: string }
): boolean {
  return calls.some(([message]) => {
    if (typeof message !== "string") return false;
    try {
      const payload = JSON.parse(message) as Record<string, unknown>;
      return (
        payload.msg === "Invalid guest token access attempt" &&
        payload.user_agent === expected.userAgent &&
        payload.ip === expected.ip
      );
    } catch {
      return false;
    }
  });
}

describe("ゲスト出欠更新のrequest security context", () => {
  test("Featureは呼び出し元から渡されたsecurity contextを利用する", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await updateGuestAttendanceFeature(createInvalidTokenFormData(), {
      ip: "198.51.100.17",
      userAgent: "feature-context-agent",
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(
      hasInvalidTokenLog(warnSpy.mock.calls, {
        ip: "198.51.100.xxx",
        userAgent: "feature-context-agent",
      })
    ).toBe(true);
  });

  test("requestのUser-AgentとIPをセキュリティログへ渡す", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const execution = await runInNextServerActionContext(
      {
        requestHeaders: {
          "cf-connecting-ip": "203.0.113.42",
          "user-agent": "issue-594-agent",
        },
      },
      async () => await updateGuestAttendanceAction(createInvalidTokenFormData())
    );

    expect(execution.result).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(
      hasInvalidTokenLog(warnSpy.mock.calls, {
        ip: "203.0.113.xxx",
        userAgent: "issue-594-agent",
      })
    ).toBe(true);
  });
});
