const mockRootLoggerWarn = jest.fn();

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    warn: mockRootLoggerWarn,
  },
}));

import { resolveEmailConfig } from "@core/notification/email-config";

describe("core/notification/email-config", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("development では未設定値をデフォルトで補完する", () => {
    const config = resolveEmailConfig({
      NODE_ENV: "development",
    });

    expect(config).toEqual({
      fromEmail: "noreply@eventpay.jp",
      fromName: "みんなの集金",
      adminEmail: "admin@eventpay.jp",
    });
    expect(mockRootLoggerWarn).toHaveBeenCalledTimes(3);
  });

  it("production で FROM_EMAIL 未設定の場合は例外", () => {
    expect(() =>
      resolveEmailConfig({
        NODE_ENV: "production",
        ADMIN_EMAIL: "admin@example.com",
      })
    ).toThrow("FROM_EMAIL environment variable is required in production");
  });

  it("production で ADMIN_EMAIL 未設定の場合は例外", () => {
    expect(() =>
      resolveEmailConfig({
        NODE_ENV: "production",
        FROM_EMAIL: "noreply@example.com",
      })
    ).toThrow("ADMIN_EMAIL environment variable is required in production");
  });

  it("production で FROM_NAME 未設定の場合はデフォルトを利用する", () => {
    const config = resolveEmailConfig({
      NODE_ENV: "production",
      FROM_EMAIL: "noreply@example.com",
      ADMIN_EMAIL: "admin@example.com",
    });

    expect(config.fromEmail).toBe("noreply@example.com");
    expect(config.adminEmail).toBe("admin@example.com");
    expect(config.fromName).toBe("みんなの集金");
    expect(mockRootLoggerWarn).toHaveBeenCalledTimes(1);
  });
});
