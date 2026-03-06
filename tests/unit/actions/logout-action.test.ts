import { jest } from "@jest/globals";

const mockLogoutActionImpl = jest.fn();
const mockTrackAuthEvent = jest.fn();
const mockEnsureFeaturesRegistered = jest.fn();
const mockProjectAuthCommandResult = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

jest.mock("@features/auth/server", () => ({
  logoutAction: (...args: unknown[]) => mockLogoutActionImpl(...args),
}));

jest.mock("@/app/_init/feature-registrations", () => ({
  ensureFeaturesRegistered: () => mockEnsureFeaturesRegistered(),
}));

jest.mock("@/app/(auth)/_actions/_shared/auth-telemetry", () => ({
  trackAuthEvent: (...args: unknown[]) => mockTrackAuthEvent(...args),
}));

jest.mock("@/app/(auth)/_actions/_shared/result-projection", () => ({
  projectAuthCommandResult: (...args: unknown[]) => mockProjectAuthCommandResult(...args),
}));

describe("app/(auth)/_actions/logout-action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("成功時も revalidatePath を呼ばず redirectUrl を返す", async () => {
    const result = { success: true, meta: {} };
    const actionResult = { success: true, redirectUrl: "/login" };
    const sideEffects = { telemetry: { name: "logout", userId: "user_1" } };

    mockLogoutActionImpl.mockResolvedValue(result);
    mockProjectAuthCommandResult.mockReturnValue({ actionResult, sideEffects });

    const { logoutAction } = await import("@/app/(auth)/_actions/logout-action");

    await expect(logoutAction()).resolves.toEqual(actionResult);
    expect(mockEnsureFeaturesRegistered).toHaveBeenCalledTimes(1);
    expect(mockLogoutActionImpl).toHaveBeenCalledTimes(1);
    expect(mockProjectAuthCommandResult).toHaveBeenCalledWith(result);
    expect(mockTrackAuthEvent).toHaveBeenCalledWith(sideEffects.telemetry);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
