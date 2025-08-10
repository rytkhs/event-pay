/**
 * OnboardingForm コンポーネントのテスト
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { jest } from "@jest/globals";
import { OnboardingForm } from "@/components/stripe-connect/onboarding-form";
import { createConnectAccountAction } from "@/app/(dashboard)/actions/stripe-connect";

// Server Actionのモック
jest.mock("@/app/(dashboard)/actions/stripe-connect", () => ({
  createConnectAccountAction: jest.fn(),
}));

const mockCreateConnectAccountAction = createConnectAccountAction as jest.MockedFunction<
  typeof createConnectAccountAction
>;

describe("OnboardingForm", () => {
  const defaultProps = {
    refreshUrl: "http://localhost:3000/refresh",
    returnUrl: "http://localhost:3000/return",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("正常にレンダリングされる", () => {
    render(<OnboardingForm {...defaultProps} />);

    expect(screen.getByText("Stripe Connect アカウント設定")).toBeInTheDocument();
    expect(
      screen.getByText("イベントの売上を受け取るために、Stripe Connectアカウントの設定が必要です。")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stripe Connect アカウントを設定する" })
    ).toBeInTheDocument();
  });

  it("機能説明が表示される", () => {
    render(<OnboardingForm {...defaultProps} />);

    expect(screen.getByText("安全な決済")).toBeInTheDocument();
    expect(screen.getByText("自動送金")).toBeInTheDocument();
    expect(screen.getByText("簡単管理")).toBeInTheDocument();
  });

  it("注意事項が表示される", () => {
    render(<OnboardingForm {...defaultProps} />);

    expect(screen.getByText("設定について：")).toBeInTheDocument();
    expect(screen.getByText(/本人確認書類.*が必要です/)).toBeInTheDocument();
    expect(screen.getByText(/銀行口座情報の登録が必要です/)).toBeInTheDocument();
  });

  it("フォーム送信時にServer Actionが呼び出される", async () => {
    mockCreateConnectAccountAction.mockResolvedValue(undefined);

    render(<OnboardingForm {...defaultProps} />);

    const submitButton = screen.getByRole("button", {
      name: "Stripe Connect アカウントを設定する",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateConnectAccountAction).toHaveBeenCalledWith(expect.any(FormData));
    });
  });

  it("送信中はボタンが無効化され、ローディング表示される", async () => {
    // Server Actionが完了しないようにPromiseを保留状態にする
    let resolvePromise: () => void;
    const pendingPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    mockCreateConnectAccountAction.mockReturnValue(pendingPromise);

    render(<OnboardingForm {...defaultProps} />);

    const submitButton = screen.getByRole("button", {
      name: "Stripe Connect アカウントを設定する",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("設定を開始しています...")).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
    });

    // Promiseを解決してクリーンアップ
    resolvePromise!();
    await pendingPromise;
  });

  it("隠しフィールドに正しいURLが設定される", () => {
    render(<OnboardingForm {...defaultProps} />);

    const refreshUrlInput = screen.getByDisplayValue(defaultProps.refreshUrl);
    const returnUrlInput = screen.getByDisplayValue(defaultProps.returnUrl);

    expect(refreshUrlInput).toHaveAttribute("name", "refreshUrl");
    expect(refreshUrlInput).toHaveAttribute("type", "hidden");
    expect(returnUrlInput).toHaveAttribute("name", "returnUrl");
    expect(returnUrlInput).toHaveAttribute("type", "hidden");
  });

  it("プライバシーと手数料の説明が表示される", () => {
    render(<OnboardingForm {...defaultProps} />);

    expect(screen.getByText("プライバシーについて：")).toBeInTheDocument();
    expect(screen.getByText(/Stripeの厳格なセキュリティ基準/)).toBeInTheDocument();
    expect(screen.getByText("手数料について：")).toBeInTheDocument();
    expect(screen.getByText(/Stripe決済手数料.*3.6%/)).toBeInTheDocument();
  });

  it("Server Actionでエラーが発生した場合の処理", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreateConnectAccountAction.mockRejectedValue(new Error("Test error"));

    render(<OnboardingForm {...defaultProps} />);

    const submitButton = screen.getByRole("button", {
      name: "Stripe Connect アカウントを設定する",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "オンボーディング開始エラー:",
        expect.any(Error)
      );
    });

    // ローディング状態が解除される
    expect(
      screen.getByRole("button", { name: "Stripe Connect アカウントを設定する" })
    ).not.toBeDisabled();

    consoleErrorSpy.mockRestore();
  });
});
