import { render, screen, fireEvent } from "@testing-library/react";
import {
  InvalidInviteError,
  EventEndedError,
  CapacityReachedError,
  RegistrationDeadlineError,
  NetworkError,
  ServerError,
  RateLimitError,
  DuplicateRegistrationError,
  GenericError,
} from "@/components/events/error-pages";

// window.location.reload をモック
const mockReload = jest.fn();
Object.defineProperty(window, "location", {
  value: {
    reload: mockReload,
    href: "",
  },
  writable: true,
});

// window.history.back をモック
const mockBack = jest.fn();
Object.defineProperty(window, "history", {
  value: {
    back: mockBack,
  },
  writable: true,
});

describe("Error Pages", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("InvalidInviteError", () => {
    it("should render invalid invite error", () => {
      render(<InvalidInviteError />);

      expect(screen.getByText("無効な招待リンク")).toBeInTheDocument();
      expect(screen.getByText(/この招待リンクは無効または期限切れです/)).toBeInTheDocument();
      expect(screen.getByText("ホームに戻る")).toBeInTheDocument();
    });

    it("should call onRetry when retry button is clicked", () => {
      const mockRetry = jest.fn();
      render(<InvalidInviteError onRetry={mockRetry} />);

      const retryButton = screen.getByText("再試行");
      fireEvent.click(retryButton);

      expect(mockRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("EventEndedError", () => {
    it("should render event ended error", () => {
      render(<EventEndedError />);

      expect(screen.getByText("イベント終了")).toBeInTheDocument();
      expect(screen.getByText(/このイベントは終了しています/)).toBeInTheDocument();
    });

    it("should render with event title", () => {
      render(<EventEndedError eventTitle="テストイベント" />);

      expect(screen.getByText(/「テストイベント」は終了しています/)).toBeInTheDocument();
    });
  });

  describe("CapacityReachedError", () => {
    it("should render capacity reached error", () => {
      render(<CapacityReachedError />);

      expect(screen.getByText("定員到達")).toBeInTheDocument();
      expect(screen.getByText(/このイベントは定員に達しています/)).toBeInTheDocument();
      expect(screen.getByText("再確認")).toBeInTheDocument();
    });

    it("should render with event details", () => {
      render(<CapacityReachedError eventTitle="テストイベント" capacity={50} />);

      expect(screen.getByText(/「テストイベント」は定員に達しています/)).toBeInTheDocument();
      expect(screen.getByText("定員: 50名")).toBeInTheDocument();
    });
  });

  describe("RegistrationDeadlineError", () => {
    it("should render registration deadline error", () => {
      render(<RegistrationDeadlineError />);

      expect(screen.getByText("申込期限終了")).toBeInTheDocument();
      expect(screen.getByText(/参加申込期限が過ぎています/)).toBeInTheDocument();
    });

    it("should render with deadline", () => {
      const deadline = "2024-12-31T23:59:59Z";
      render(<RegistrationDeadlineError deadline={deadline} />);

      expect(screen.getByText(/申込期限:/)).toBeInTheDocument();
    });
  });

  describe("NetworkError", () => {
    it("should render network error", () => {
      render(<NetworkError />);

      expect(screen.getByText("接続エラー")).toBeInTheDocument();
      expect(screen.getByText(/インターネット接続に問題があります/)).toBeInTheDocument();
      expect(screen.getByText("再接続")).toBeInTheDocument();
    });

    it("should call onRetry when retry button is clicked", () => {
      const mockRetry = jest.fn();
      render(<NetworkError onRetry={mockRetry} />);

      const retryButton = screen.getByText("再接続");
      fireEvent.click(retryButton);

      expect(mockRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("ServerError", () => {
    it("should render server error", () => {
      render(<ServerError />);

      expect(screen.getByText("サーバーエラー")).toBeInTheDocument();
      expect(screen.getByText(/サーバーで問題が発生しています/)).toBeInTheDocument();
    });
  });

  describe("RateLimitError", () => {
    it("should render rate limit error", () => {
      render(<RateLimitError />);

      expect(screen.getByText("アクセス制限")).toBeInTheDocument();
      expect(screen.getByText(/アクセス頻度が高すぎます/)).toBeInTheDocument();
      expect(screen.getByText(/5分程度お待ちください/)).toBeInTheDocument();
    });
  });

  describe("DuplicateRegistrationError", () => {
    it("should render duplicate registration error", () => {
      render(<DuplicateRegistrationError />);

      expect(screen.getByText("重複登録")).toBeInTheDocument();
      expect(screen.getByText(/既に登録済みです/)).toBeInTheDocument();
      expect(screen.getByText("戻る")).toBeInTheDocument();
    });

    it("should render with masked email", () => {
      render(<DuplicateRegistrationError email="test@example.com" />);

      expect(screen.getByText(/te\*\*\*@example\.com/)).toBeInTheDocument();
    });

    it("should call history.back when back button is clicked", () => {
      render(<DuplicateRegistrationError />);

      const backButton = screen.getByText("戻る");
      fireEvent.click(backButton);

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("GenericError", () => {
    it("should render generic error with default values", () => {
      render(<GenericError />);

      expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
      expect(screen.getByText("予期しないエラーが発生しました")).toBeInTheDocument();
    });

    it("should render with custom values", () => {
      render(
        <GenericError title="カスタムエラー" message="カスタムメッセージ" description="詳細説明" />
      );

      expect(screen.getByText("カスタムエラー")).toBeInTheDocument();
      expect(screen.getByText("カスタムメッセージ")).toBeInTheDocument();
      expect(screen.getByText("詳細説明")).toBeInTheDocument();
    });
  });

  describe("Common functionality", () => {
    it("should navigate to home when home button is clicked", () => {
      render(<GenericError />);

      const homeButton = screen.getByText("ホームに戻る");
      fireEvent.click(homeButton);

      expect(window.location.href).toBe("/");
    });

    it("should reload page when retry button is clicked (default behavior)", () => {
      render(<NetworkError />);

      const retryButton = screen.getByText("再接続");
      fireEvent.click(retryButton);

      expect(mockReload).toHaveBeenCalledTimes(1);
    });
  });
});
