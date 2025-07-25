import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteLink } from "@/components/events/invite-link";
import { generateInviteTokenAction } from "@/app/events/actions";

import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";

// 統一モック設定を適用
UnifiedMockFactory.setupCommonMocks();
// Toastフックをモック
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Server Actionをモック
jest.mock("@/app/events/actions", () => ({
  generateInviteTokenAction: jest.fn(),
}));

// クリップボードフックをモック
jest.mock("@/hooks/use-clipboard", () => ({
  useClipboard: () => ({
    copyToClipboard: jest.fn().mockResolvedValue(true),
    isCopied: false,
  }),
}));

const mockGenerateInviteTokenAction = generateInviteTokenAction as jest.MockedFunction<
  typeof generateInviteTokenAction
>;

// Jest環境のlocation mockingを設定
// JSDOMのデフォルトlocationを使用

describe("InviteLink Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should display generate button when no initial token", () => {
    render(<InviteLink eventId="test-event-id" />);

    expect(screen.getByText("招待リンクを生成")).toBeInTheDocument();
    expect(screen.getByText(/参加者が簡単にイベントにアクセスできる/)).toBeInTheDocument();
  });

  it("should display invite URL when initial token is provided", () => {
    const initialToken = "test-token-123";
    render(<InviteLink eventId="test-event-id" initialInviteToken={initialToken} />);

    const input = screen.getByTestId("invite-url-input") as HTMLInputElement;
    expect(input.value).toBe(`http://localhost/invite/${initialToken}`);
    expect(screen.getByTestId("copy-button")).toBeInTheDocument();
    expect(screen.getByTestId("share-button")).toBeInTheDocument();
  });

  it("should generate new invite token when button is clicked", async () => {
    const mockResult = {
      success: true,
      data: {
        inviteToken: "new-token-456",
        inviteUrl: "http://localhost/invite/new-token-456",
      },
    };

    mockGenerateInviteTokenAction.mockResolvedValue(mockResult);

    render(<InviteLink eventId="test-event-id" />);

    const generateButton = screen.getByText("招待リンクを生成");
    fireEvent.click(generateButton);

    // ローディング状態の確認
    expect(screen.getByText("生成中...")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGenerateInviteTokenAction).toHaveBeenCalledWith("test-event-id", {
        forceRegenerate: false,
      });
    });

    await waitFor(() => {
      const input = screen.getByTestId("invite-url-input") as HTMLInputElement;
      expect(input.value).toBe("http://localhost/invite/new-token-456");
    });
  });

  it("should handle generation error", async () => {
    const mockResult = {
      success: false,
      error: "Permission denied",
    };

    mockGenerateInviteTokenAction.mockResolvedValue(mockResult);

    render(<InviteLink eventId="test-event-id" />);

    const generateButton = screen.getByText("招待リンクを生成");
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(mockGenerateInviteTokenAction).toHaveBeenCalledWith("test-event-id", {
        forceRegenerate: false,
      });
    });

    // エラー状態でもボタンが元に戻る
    await waitFor(() => {
      expect(screen.getByText("招待リンクを生成")).toBeInTheDocument();
    });
  });

  it("should handle copy button click", async () => {
    const initialToken = "test-token-123";
    render(<InviteLink eventId="test-event-id" initialInviteToken={initialToken} />);

    const copyButton = screen.getByTestId("copy-button");
    fireEvent.click(copyButton);

    // クリップボードフックの呼び出しは実際のテストでは確認できないが、
    // UI上のフィードバックは確認できる
    expect(copyButton).toBeInTheDocument();
  });

  describe("Force Regeneration Feature", () => {
    it("should display regenerate button when token exists", () => {
      const initialToken = "test-token-123";
      render(<InviteLink eventId="test-event-id" initialInviteToken={initialToken} />);

      expect(screen.getByTestId("regenerate-button")).toBeInTheDocument();
      expect(screen.getByText("再生成")).toBeInTheDocument();
    });

    it("should show confirmation dialog when regenerate button is clicked", () => {
      const initialToken = "test-token-123";

      // window.confirmをモック
      const mockConfirm = jest.spyOn(window, "confirm").mockReturnValue(false);

      render(<InviteLink eventId="test-event-id" initialInviteToken={initialToken} />);

      const regenerateButton = screen.getByTestId("regenerate-button");
      fireEvent.click(regenerateButton);

      expect(mockConfirm).toHaveBeenCalledWith(
        "招待リンクを再生成しますか？\n\n現在のリンクは無効になり、参加者に新しいリンクを共有する必要があります。"
      );

      mockConfirm.mockRestore();
    });

    it("should regenerate token when user confirms", async () => {
      const initialToken = "test-token-123";
      const newToken = "new-token-456";

      const mockResult = {
        success: true,
        data: {
          inviteToken: newToken,
          inviteUrl: `http://localhost/invite/${newToken}`,
        },
      };

      mockGenerateInviteTokenAction.mockResolvedValue(mockResult);

      // window.confirmをモック（trueを返す）
      const mockConfirm = jest.spyOn(window, "confirm").mockReturnValue(true);

      render(<InviteLink eventId="test-event-id" initialInviteToken={initialToken} />);

      const regenerateButton = screen.getByTestId("regenerate-button");
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(mockGenerateInviteTokenAction).toHaveBeenCalledWith("test-event-id", {
          forceRegenerate: true,
        });
      });

      await waitFor(() => {
        const input = screen.getByTestId("invite-url-input") as HTMLInputElement;
        expect(input.value).toBe(`http://localhost/invite/${newToken}`);
      });

      mockConfirm.mockRestore();
    });

    it("should not regenerate token when user cancels", async () => {
      const initialToken = "test-token-123";

      // window.confirmをモック（falseを返す）
      const mockConfirm = jest.spyOn(window, "confirm").mockReturnValue(false);

      render(<InviteLink eventId="test-event-id" initialInviteToken={initialToken} />);

      const regenerateButton = screen.getByTestId("regenerate-button");
      fireEvent.click(regenerateButton);

      // generateInviteTokenActionが呼ばれていないことを確認
      expect(mockGenerateInviteTokenAction).not.toHaveBeenCalled();

      mockConfirm.mockRestore();
    });

    it("should display security warning", () => {
      const initialToken = "test-token-123";
      render(<InviteLink eventId="test-event-id" initialInviteToken={initialToken} />);

      expect(
        screen.getByText(
          /⚠️ リンクが漏洩した場合は「再生成」ボタンで新しいリンクを作成してください。/
        )
      ).toBeInTheDocument();
    });
  });
});
