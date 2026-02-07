import { jest } from "@jest/globals";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";
import {
  dismissInviteSuccessAction,
  registerParticipationAction,
} from "@/app/invite/[token]/actions";
import {
  dismissInviteSuccessAction as dismissInviteSuccessActionImpl,
  registerParticipationAction as registerParticipationActionImpl,
} from "@features/invite/server";

jest.mock("@/app/_init/feature-registrations", () => ({
  ensureFeaturesRegistered: jest.fn(),
}));

jest.mock("@features/invite/server", () => ({
  registerParticipationAction: jest.fn(),
  dismissInviteSuccessAction: jest.fn(),
}));

describe("app/invite/[token]/actions", () => {
  const mockEnsureFeaturesRegistered = ensureFeaturesRegistered as jest.MockedFunction<
    typeof ensureFeaturesRegistered
  >;
  const mockRegisterParticipationActionImpl =
    registerParticipationActionImpl as jest.MockedFunction<typeof registerParticipationActionImpl>;
  const mockDismissInviteSuccessActionImpl = dismissInviteSuccessActionImpl as jest.MockedFunction<
    typeof dismissInviteSuccessActionImpl
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registerParticipationAction: 初期化後にfeature actionを呼び出す", async () => {
    const formData = new FormData();
    formData.append("inviteToken", "inv_12345678901234567890123456789012");
    const expected = { success: true } as const;
    mockRegisterParticipationActionImpl.mockResolvedValue(expected);

    const result = await registerParticipationAction(formData);

    expect(mockEnsureFeaturesRegistered).toHaveBeenCalledTimes(1);
    expect(mockRegisterParticipationActionImpl).toHaveBeenCalledWith(formData);
    expect(result).toEqual(expected);
  });

  it("dismissInviteSuccessAction: 初期化後にfeature actionを呼び出す", async () => {
    const inviteToken = "inv_12345678901234567890123456789012";
    const expected = { success: true } as const;
    mockDismissInviteSuccessActionImpl.mockResolvedValue(expected);

    const result = await dismissInviteSuccessAction(inviteToken);

    expect(mockEnsureFeaturesRegistered).toHaveBeenCalledTimes(1);
    expect(mockDismissInviteSuccessActionImpl).toHaveBeenCalledWith(inviteToken);
    expect(result).toEqual(expected);
  });
});
