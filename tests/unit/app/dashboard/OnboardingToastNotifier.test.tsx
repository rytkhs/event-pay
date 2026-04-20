/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, waitFor } from "@testing-library/react";
import { toast as sonnerToast } from "sonner";

import { OnboardingToastNotifier } from "../../../../app/(app)/dashboard/components/OnboardingToastNotifier";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/dashboard"),
  useRouter: jest.fn(() => ({
    replace: mockReplace,
  })),
  useSearchParams: jest.fn(() => new URLSearchParams("onboarding=stripe_return&tab=events")),
}));

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
  }),
}));

const mockReplace = jest.fn();
const mockToast = sonnerToast as jest.Mock & { success: jest.Mock };

describe("OnboardingToastNotifier", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockToast.mockClear();
    mockToast.success.mockClear();
  });

  it("shows completion toast when onboarding returned and no CTA is needed", async () => {
    render(<OnboardingToastNotifier statusResolved={true} />);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("設定が完了しました", {
        description: "さっそくイベントを作成しましょう",
      });
    });

    expect(mockToast).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/dashboard?tab=events", { scroll: false });
  });

  it("does not treat unresolved status as completed onboarding", async () => {
    render(<OnboardingToastNotifier statusResolved={false} />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("Stripe アカウント設定の状態を確認できませんでした", {
        description: "ダッシュボードを再読み込みして、設定状況を確認してください",
      });
    });

    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/dashboard?tab=events", { scroll: false });
  });
});
