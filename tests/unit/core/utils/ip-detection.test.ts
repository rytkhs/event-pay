import { getClientIP, getClientIPFromHeaders } from "@core/utils/ip-detection";

function createHeaderLike(init?: Record<string, string>) {
  return new Headers(init);
}

describe("ip-detection", () => {
  test("CF-Connecting-IP の IPv4 を返す", () => {
    const headers = createHeaderLike({ "cf-connecting-ip": "203.0.113.10" });

    expect(getClientIPFromHeaders(headers)).toBe("203.0.113.10");
  });

  test("CF-Connecting-IP の IPv6 を返す（小文字化）", () => {
    const headers = createHeaderLike({ "cf-connecting-ip": "2001:DB8::1" });

    expect(getClientIPFromHeaders(headers)).toBe("2001:db8::1");
  });

  test("CF-Connecting-IP が欠落している場合は null", () => {
    const headers = createHeaderLike();

    expect(getClientIPFromHeaders(headers)).toBeNull();
  });

  test("CF-Connecting-IP が不正値の場合は null", () => {
    const headers = createHeaderLike({ "cf-connecting-ip": "::::" });

    expect(getClientIPFromHeaders(headers)).toBeNull();
  });

  test("CF-Connecting-IP 以外のヘッダーは無視する", () => {
    const headers = createHeaderLike({ "x-forwarded-for": "198.51.100.1" });

    expect(getClientIPFromHeaders(headers)).toBeNull();
  });

  test("NextRequest 互換オブジェクトでも取得できる", () => {
    const requestLike = {
      headers: createHeaderLike({ "cf-connecting-ip": "198.51.100.44" }),
    };

    expect(getClientIP(requestLike as Parameters<typeof getClientIP>[0])).toBe("198.51.100.44");
  });
});
