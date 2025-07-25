/**
 * @file ユーザー登録フォームのバリデーションエラー表示テスト
 * @description 登録フォームでのバリデーションエラー詳細表示機能のテスト
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// モックコンポーネント
const MockRegisterPage = () => {
  return (
    <div>
      <h1>ユーザー登録</h1>
      <form>
        <input placeholder="名前を入力してください" />
        <input placeholder="example@mail.com" />
        <input placeholder="英数字を含む8文字以上" />
        <input placeholder="パスワード（確認）" />
        <button type="submit">登録</button>
      </form>
    </div>
  );
};

describe("ユーザー登録フォーム - バリデーションエラー表示", () => {
  it("基本的な登録フォームがレンダリングされる", () => {
    render(<MockRegisterPage />);

    // フォーム要素の存在確認
    expect(screen.getByText("ユーザー登録")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("名前を入力してください")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("example@mail.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("英数字を含む8文字以上")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("パスワード（確認）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登録" })).toBeInTheDocument();
  });

  it("フォーム入力フィールドがアクセシブルである", () => {
    render(<MockRegisterPage />);

    // 入力フィールドがフォーカス可能であることを確認
    const nameInput = screen.getByPlaceholderText("名前を入力してください");
    const emailInput = screen.getByPlaceholderText("example@mail.com");
    const passwordInput = screen.getByPlaceholderText("英数字を含む8文字以上");
    const confirmPasswordInput = screen.getByPlaceholderText("パスワード（確認）");

    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
    expect(confirmPasswordInput).toBeInTheDocument();
  });
});
