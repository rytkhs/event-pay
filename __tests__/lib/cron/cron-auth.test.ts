/**
 * @file cron-auth ユニットテスト（軽量）
 */

import { validateCronSecret } from "@/lib/cron-auth";

describe("validateCronSecret", () => {
  const VALID_SECRET = "test-cron-secret-123";

  beforeEach(() => {
    process.env.CRON_SECRET = VALID_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("Bearer トークンで認証成功する", () => {
    const request = {
      headers: {
        get: (key: string) => (key === "authorization" ? `Bearer ${VALID_SECRET}` : null),
      },
    } as any;

    const result = validateCronSecret(request);
    expect(result).toEqual({ isValid: true });
  });

  it("x-cron-secret ヘッダーで認証成功する", () => {
    const request = {
      headers: {
        get: (key: string) => (key === "x-cron-secret" ? VALID_SECRET : null),
      },
    } as any;

    const result = validateCronSecret(request);
    expect(result).toEqual({ isValid: true });
  });

  it("クエリパラメータ ?secret= で認証成功する（nextUrl経由）", () => {
    const request = {
      headers: { get: () => null },
      nextUrl: { searchParams: new URLSearchParams([["secret", VALID_SECRET]]) },
    } as any;

    const result = validateCronSecret(request);
    expect(result).toEqual({ isValid: true });
  });

  it("クエリパラメータ ?secret= で認証成功する（url文字列経由）", () => {
    const request = {
      headers: { get: () => null },
      url: `https://example.com/api/cron/process-payouts?secret=${VALID_SECRET}`,
    } as any;

    const result = validateCronSecret(request);
    expect(result).toEqual({ isValid: true });
  });

  it("無効なシークレットは拒否される", () => {
    const request = {
      headers: {
        get: (key: string) => (key === "authorization" ? `Bearer invalid` : null),
      },
    } as any;

    const result = validateCronSecret(request);
    expect(result).toEqual({ isValid: false, error: "Invalid or missing CRON secret" });
  });

  it("CRON_SECRET未設定は拒否される", () => {
    delete process.env.CRON_SECRET;

    const request = {
      headers: {
        get: (key: string) => (key === "authorization" ? `Bearer ${VALID_SECRET}` : null),
      },
    } as any;

    const result = validateCronSecret(request);
    expect(result).toEqual({ isValid: false, error: "CRON_SECRET not configured" });
  });
});
