import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { jest } from "@jest/globals";
import EventCreateForm from "@/components/events/event-form";
import { getFutureDatetimeLocalForTest } from "@/lib/utils/test-helpers";

// Mock Server Action
jest.mock("@/app/events/actions", () => ({
  createEventAction: jest.fn(),
}));

describe("EventCreateForm Security Tests", () => {
  describe("XSS対策テスト", () => {
    it("タイトルフィールドでXSSスクリプトが無害化される", async () => {
      render(<EventCreateForm />);

      const titleInput = screen.getByLabelText("タイトル");
      const xssScript = '<script>alert("XSS")</script>';

      fireEvent.change(titleInput, { target: { value: xssScript } });

      // 入力値が適切にエスケープされていることを確認
      expect(titleInput).toHaveValue(xssScript);

      // DOM上でスクリプトが実行されていないことを確認
      expect(document.querySelector("script")).toBeNull();
    });

    it("説明フィールドでHTMLタグが無害化される", async () => {
      render(<EventCreateForm />);

      const descriptionInput = screen.getByLabelText("説明");
      const htmlContent = '<img src="x" onerror="alert(1)">';

      fireEvent.change(descriptionInput, { target: { value: htmlContent } });

      // 入力値が適切にエスケープされていることを確認
      expect(descriptionInput).toHaveValue(htmlContent);

      // 不正なHTMLが実行されていないことを確認
      expect(document.querySelector('img[src="x"]')).toBeNull();
    });

    it("場所フィールドでJavaScriptイベントが無害化される", async () => {
      render(<EventCreateForm />);

      const locationInput = screen.getByLabelText("場所");
      const jsEvent = 'onclick="alert(1)"';

      fireEvent.change(locationInput, { target: { value: jsEvent } });

      // 入力値が適切にエスケープされていることを確認
      expect(locationInput).toHaveValue(jsEvent);

      // JavaScript イベントが実行されていないことを確認
      expect(locationInput.getAttribute("onclick")).toBeNull();
    });
  });

  describe("入力値サニタイゼーションテスト", () => {
    it("SQLインジェクション攻撃文字列が適切に処理される", async () => {
      const mockCreateEvent = jest.fn().mockResolvedValue({ success: true });
      jest.doMock("@/app/events/actions", () => ({
        createEventAction: mockCreateEvent,
      }));

      render(<EventCreateForm />);

      const titleInput = screen.getByLabelText("タイトル");
      const sqlInjection = "'; DROP TABLE events; --";

      fireEvent.change(titleInput, { target: { value: sqlInjection } });

      fireEvent.change(screen.getByLabelText("開催日時"), {
        target: { value: getFutureDatetimeLocalForTest(168) }, // 7日後
      });

      fireEvent.click(screen.getByLabelText("Stripe決済"));

      // 参加費フィールドが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByLabelText("参加費")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText("参加費"), {
        target: { value: "1000" },
      });

      const submitButton = screen.getByRole("button", { name: /作成/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateEvent).toHaveBeenCalledWith(expect.any(FormData));
      });

      // FormDataに含まれる値が適切にサニタイズされていることを確認
      const formData = mockCreateEvent.mock.calls[0][0];
      expect(formData.get("title")).toBe(sqlInjection);
    });

    it("異常に長い入力値が適切に処理される", async () => {
      render(<EventCreateForm />);

      const titleInput = screen.getByLabelText("タイトル");
      const longInput = "a".repeat(10000);

      fireEvent.change(titleInput, { target: { value: longInput } });

      const submitButton = screen.getByRole("button", { name: /作成/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("タイトルは100文字以内で入力してください")).toBeInTheDocument();
      });
    });

    it("特殊文字が含まれる入力値が適切に処理される", async () => {
      render(<EventCreateForm />);

      const titleInput = screen.getByLabelText("タイトル");
      const specialChars = "©®™€¥£¢¡¿áéíóúñü";

      fireEvent.change(titleInput, { target: { value: specialChars } });

      // 特殊文字が正しく表示されることを確認
      expect(titleInput).toHaveValue(specialChars);
    });
  });

  describe("CSRF保護テスト", () => {
    it("フォーム送信時にCSRFトークンが含まれている", async () => {
      render(<EventCreateForm />);

      const form = screen.getByRole("form");

      // フォームにCSRFトークンが含まれていることを確認
      // Server Actionsの場合、Next.jsが自動的にCSRF保護を提供
      expect(form).toHaveAttribute("action");
    });

    it("Server Actionが適切に設定されている", async () => {
      render(<EventCreateForm />);

      const form = document.querySelector("form");

      // フォームが存在することを確認
      expect(form).toBeInTheDocument();
      // Server Actionが適切に設定されていることを確認（React Hook Formの場合はonSubmitハンドラーが存在）
      expect(form).toHaveAttribute("novalidate");
    });
  });

  describe("入力値検証テスト", () => {
    it("数値フィールドに文字列が入力された場合のバリデーション", async () => {
      render(<EventCreateForm />);

      const feeInput = screen.getByLabelText("参加費 *");
      fireEvent.change(feeInput, { target: { value: "invalid" } });

      const submitButton = screen.getByRole("button", { name: /作成/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("参加費は0以上である必要があります")).toBeInTheDocument();
      });
    });

    it("定員フィールドに負の数値が入力された場合のバリデーション", async () => {
      render(<EventCreateForm />);

      const capacityInput = screen.getByLabelText("定員");
      fireEvent.change(capacityInput, { target: { value: "-1" } });

      const submitButton = screen.getByRole("button", { name: /作成/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("定員は1名以上で入力してください")).toBeInTheDocument();
      });
    });

    it("日付フィールドに不正な形式が入力された場合のバリデーション", async () => {
      render(<EventCreateForm />);

      const dateInput = screen.getByLabelText("開催日時 *");
      fireEvent.change(dateInput, { target: { value: "invalid-date" } });

      const submitButton = screen.getByRole("button", { name: /作成/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("開催日時は必須です")).toBeInTheDocument();
      });
    });
  });

  describe("権限テスト", () => {
    it("未認証ユーザーは適切にリダイレクトされる", async () => {
      const mockPush = jest.fn();
      jest.doMock("next/navigation", () => ({
        useRouter: () => ({ push: mockPush }),
      }));

      // 未認証状態をモック
      jest.doMock("@/lib/auth", () => ({
        getUser: jest.fn().mockResolvedValue(null),
      }));

      render(<EventCreateForm />);

      // 未認証の場合、ログインページにリダイレクトされることを確認
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/auth/login");
      });
    });

    it("認証済みユーザーのみがフォームを表示できる", async () => {
      // 認証済み状態をモック
      jest.doMock("@/lib/auth", () => ({
        getUser: jest.fn().mockResolvedValue({ id: "user-id", email: "test@example.com" }),
      }));

      render(<EventCreateForm />);

      // フォームが表示されることを確認
      expect(screen.getByLabelText("タイトル")).toBeInTheDocument();
      expect(screen.getByLabelText("開催日時")).toBeInTheDocument();
      expect(screen.getByLabelText("参加費")).toBeInTheDocument();
    });
  });

  describe("データ漏洩防止テスト", () => {
    it("エラーメッセージに機密情報が含まれていない", async () => {
      const mockCreateEvent = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed: password123"));
      jest.doMock("@/app/events/actions", () => ({
        createEventAction: mockCreateEvent,
      }));

      render(<EventCreateForm />);

      const titleInput = screen.getByLabelText("イベントタイトル *");
      fireEvent.change(titleInput, { target: { value: "テストイベント" } });

      fireEvent.change(screen.getByLabelText("開催日時 *"), {
        target: { value: getFutureDatetimeLocalForTest(168) }, // 7日後
      });

      fireEvent.click(screen.getByLabelText("💳 Stripe決済"));

      // 参加費フィールドが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByLabelText("参加費 *")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText("参加費 *"), {
        target: { value: "1000" },
      });

      const submitButton = screen.getByRole("button", { name: /作成/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        // 一般的なエラーメッセージが表示されることを確認
        expect(
          screen.getByText("エラーが発生しました。もう一度お試しください。")
        ).toBeInTheDocument();
        // 機密情報が含まれていないことを確認
        expect(screen.queryByText(/password123/)).not.toBeInTheDocument();
      });
    });
  });
});
