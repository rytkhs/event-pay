/**
 * @file ユーザー登録フォームのバリデーションエラー表示テスト
 * @description 登録フォームでのバリデーションエラー詳細表示機能のテスト
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import RegisterPage from "@/app/auth/register/page";

// Next.jsルーターのモック
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// fetch APIのモック
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("ユーザー登録フォーム - バリデーションエラー表示", () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
    mockFetch.mockClear();
    mockPush.mockClear();
  });

  test("APIからのバリデーションエラーが詳細表示される", async () => {
    // APIのバリデーションエラーレスポンスをモック
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          error: "バリデーションエラーが発生しました",
          details: {
            name: "名前は必須です",
            email: "有効なメールアドレスを入力してください",
            password: "パスワードは8文字以上で入力してください",
          },
        }),
    });

    render(<RegisterPage />);

    // 有効なデータを入力してクライアント側バリデーションを通す
    fireEvent.change(screen.getByPlaceholderText("名前を入力してください"), {
      target: { value: "テストユーザー" },
    });
    fireEvent.change(screen.getByPlaceholderText("example@mail.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("英数字を含む8文字以上"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("パスワード（確認）"), {
      target: { value: "password123" },
    });

    // 登録ボタンをクリック
    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    // API呼び出しとエラー表示を待機
    await waitFor(() => {
      expect(screen.getByText("入力内容を確認してください")).toBeInTheDocument();
    });

    // 各フィールドのエラーメッセージが表示されることを確認
    expect(screen.getByText("名前は必須です")).toBeInTheDocument();
    expect(screen.getByText("有効なメールアドレスを入力してください")).toBeInTheDocument();
    expect(screen.getByText("パスワードは8文字以上で入力してください")).toBeInTheDocument();
  });

  test("フィールドにエラーがある場合、赤いボーダースタイルが適用される", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          error: "バリデーションエラーが発生しました",
          details: {
            email: "有効なメールアドレスを入力してください",
          },
        }),
    });

    render(<RegisterPage />);

    // 有効なデータでクライアント側バリデーションを通す
    fireEvent.change(screen.getByPlaceholderText("名前を入力してください"), {
      target: { value: "テストユーザー" },
    });
    const emailInput = screen.getByPlaceholderText("example@mail.com");
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("英数字を含む8文字以上"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("パスワード（確認）"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(screen.getByText("有効なメールアドレスを入力してください")).toBeInTheDocument();
    });

    // エラーがあるフィールドに赤いボーダーが適用されることを確認
    expect(emailInput).toHaveClass("border-red-500");
  });

  test("一般的なAPIエラーの場合、詳細表示は行われない", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          error: "サーバーエラーが発生しました",
        }),
    });

    render(<RegisterPage />);

    fireEvent.change(screen.getByPlaceholderText("名前を入力してください"), {
      target: { value: "テストユーザー" },
    });
    fireEvent.change(screen.getByPlaceholderText("example@mail.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("英数字を含む8文字以上"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("パスワード（確認）"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(screen.getByText("サーバーエラーが発生しました")).toBeInTheDocument();
    });

    // 詳細エラーメッセージは表示されない
    expect(screen.queryByText("入力内容を確認してください")).not.toBeInTheDocument();
  });

  test("エラーが解消されると、エラー表示とスタイルがクリアされる", async () => {
    // 最初にエラーレスポンス
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          error: "バリデーションエラーが発生しました",
          details: {
            email: "有効なメールアドレスを入力してください",
          },
        }),
    });

    render(<RegisterPage />);

    const emailInput = screen.getByPlaceholderText("example@mail.com");
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(screen.getByText("有効なメールアドレスを入力してください")).toBeInTheDocument();
    });

    // 成功レスポンスをモック
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          message: "登録が完了しました",
        }),
    });

    // 正しいデータで再送信
    fireEvent.change(screen.getByPlaceholderText("名前を入力してください"), {
      target: { value: "テストユーザー" },
    });
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("英数字を含む8文字以上"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("パスワード（確認）"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    // エラーメッセージがクリアされることを確認
    await waitFor(() => {
      expect(screen.queryByText("有効なメールアドレスを入力してください")).not.toBeInTheDocument();
    });

    // リダイレクトが実行されることを確認
    expect(mockPush).toHaveBeenCalledWith("/auth/confirm?email=test%40example.com");
  });

  test("FormFieldコンポーネントでアクセシビリティが確保されている", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({
          success: false,
          error: "バリデーションエラーが発生しました",
          details: {
            name: "名前は必須です",
          },
        }),
    });

    render(<RegisterPage />);

    // 有効なデータでクライアント側バリデーションを通す
    fireEvent.change(screen.getByPlaceholderText("名前を入力してください"), {
      target: { value: "テストユーザー" },
    });
    fireEvent.change(screen.getByPlaceholderText("example@mail.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("英数字を含む8文字以上"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("パスワード（確認）"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "登録" }));

    await waitFor(() => {
      expect(screen.getByText("名前は必須です")).toBeInTheDocument();
    });

    // エラーメッセージにrole="alert"が設定されていることを確認
    const errorElement = screen.getByText("名前は必須です");
    expect(errorElement.closest('[role="alert"]')).toBeInTheDocument();

    // エラーアイコンが表示されることを確認
    const alertIcon = screen.getByText("名前は必須です").previousElementSibling;
    expect(alertIcon).toHaveAttribute("aria-hidden", "true");
  });
});
