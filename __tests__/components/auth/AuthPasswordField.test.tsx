/**
 * AuthPasswordField コンポーネントのテスト
 * パスワードフィールドコンポーネントのテスト（パスワード表示切り替え機能付き）
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthPasswordField } from "@/components/auth/AuthFormField";

describe("AuthPasswordField - パスワード表示切り替え", () => {
  describe("レンダリング", () => {
    it("パスワードフィールドと切り替えボタンをレンダリングする", () => {
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute("type", "password");
      expect(toggleButton).toBeInTheDocument();
    });

    it("切り替えボタンに目のアイコンをレンダリングする", () => {
      render(<AuthPasswordField name="password" label="Password" />);

      const toggleButton = screen.getByRole("button", { name: /パスワード/i });
      const eyeIcon = screen.getByTestId("password-toggle-icon");

      expect(toggleButton).toContainElement(eyeIcon);
    });

    it("初期状態が正しい（パスワードが非表示）", () => {
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      expect(passwordInput).toHaveAttribute("type", "password");
    });
  });

  describe("切り替え機能", () => {
    it("クリックでパスワードの表示/非表示を切り替える", async () => {
      const user = userEvent.setup();
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // 初期状態: パスワード非表示
      expect(passwordInput).toHaveAttribute("type", "password");

      // クリックしてパスワードを表示
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute("type", "text");

      // 再度クリックしてパスワードを非表示
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("切り替えボタンのアクセシビリティラベルと押下状態を更新する", async () => {
      const user = userEvent.setup();
      render(<AuthPasswordField name="password" label="Password" />);

      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // 初期状態
      expect(toggleButton).toHaveAttribute("aria-label", "パスワードを表示");
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");

      // 表示に切り替え後
      await user.click(toggleButton);
      expect(toggleButton).toHaveAttribute("aria-label", "パスワードを非表示");
      expect(toggleButton).toHaveAttribute("aria-pressed", "true");

      // 非表示に切り替え後
      await user.click(toggleButton);
      expect(toggleButton).toHaveAttribute("aria-label", "パスワードを表示");
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");
    });

    it("切り替え時にアイコンの状態を更新する", async () => {
      const user = userEvent.setup();
      render(<AuthPasswordField name="password" label="Password" />);

      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // 初期状態: 目のアイコン（パスワード非表示）
      expect(screen.getByTestId("password-toggle-icon")).toHaveAttribute("data-state", "hidden");

      // パスワード表示時: 目を閉じたアイコン
      await user.click(toggleButton);
      expect(screen.getByTestId("password-toggle-icon")).toHaveAttribute("data-state", "visible");

      // パスワード非表示時: 目のアイコン
      await user.click(toggleButton);
      expect(screen.getByTestId("password-toggle-icon")).toHaveAttribute("data-state", "hidden");
    });
  });

  describe("キーボードアクセシビリティ", () => {
    it("キーボードナビゲーションでアクセスできる", async () => {
      const user = userEvent.setup();
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // Tabでパスワード入力欄にフォーカス
      await user.tab();
      expect(passwordInput).toHaveFocus();

      // Tabで切り替えボタンにフォーカス
      await user.tab();
      expect(toggleButton).toHaveFocus();
    });

    it("Enterキーでパスワード表示を切り替える", async () => {
      const user = userEvent.setup();
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // 切り替えボタンにフォーカス
      toggleButton.focus();

      // Enterキーで切り替え
      await user.keyboard("{Enter}");
      expect(passwordInput).toHaveAttribute("type", "text");

      await user.keyboard("{Enter}");
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("スペースキーでパスワード表示を切り替える", async () => {
      const user = userEvent.setup();
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // 切り替えボタンにフォーカス
      toggleButton.focus();

      // スペースキーで切り替え
      await user.keyboard(" ");
      expect(passwordInput).toHaveAttribute("type", "text");

      await user.keyboard(" ");
      expect(passwordInput).toHaveAttribute("type", "password");
    });
  });

  describe("ARIA属性", () => {
    it("適切なARIA属性を持つ", () => {
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // 切り替えボタンが適切なARIA属性を持つ
      expect(toggleButton).toHaveAttribute("aria-label", "パスワードを表示");
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");
      expect(toggleButton).toHaveAttribute("aria-controls", "password");
      expect(toggleButton).toHaveAttribute("type", "button");
      expect(toggleButton).toHaveAttribute("tabindex", "0");

      // パスワード入力欄が切り替えボタンと関連付けられている
      expect(passwordInput).toHaveAttribute("aria-describedby");
    });

    it("適切なフォーカス管理を維持する", async () => {
      const user = userEvent.setup();
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // パスワード入力欄にフォーカス後、切り替えボタンをクリック
      await user.click(passwordInput);
      await user.click(toggleButton);

      // フォーカスは切り替えボタンに残る
      expect(toggleButton).toHaveFocus();
    });
  });

  describe("フォームプロパティとの統合", () => {
    it("既存のパスワードフィールドの機能をすべて維持する", () => {
      render(
        <AuthPasswordField
          name="password"
          label="Password"
          required
          autoComplete="current-password"
        />
      );

      const passwordInput = screen.getByLabelText("Password");

      expect(passwordInput).toHaveAttribute("name", "password");
      expect(passwordInput).toHaveAttribute("required");
      expect(passwordInput).toHaveAttribute("autoComplete", "current-password");
      expect(passwordInput).toHaveAttribute("id", "password");
    });

    it("エラー状態を切り替えボタンと共に正しく表示する", () => {
      render(<AuthPasswordField name="password" label="Password" error="Password is required" />);

      const passwordInput = screen.getByLabelText("Password");
      const errorMessage = screen.getByText("Password is required");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      expect(passwordInput).toHaveClass("border-red-500");
      expect(errorMessage).toBeInTheDocument();
      expect(toggleButton).toBeInTheDocument(); // エラー時も切り替えボタンが動作する
    });

    it("フィールドエラー配列と連携する", () => {
      render(
        <AuthPasswordField
          name="password"
          label="Password"
          fieldErrors={["Password must be at least 8 characters"]}
        />
      );

      const errorMessage = screen.getByText("Password must be at least 8 characters");
      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      expect(errorMessage).toBeInTheDocument();
      expect(toggleButton).toBeInTheDocument();
    });
  });

  describe("スタイリングとレイアウト", () => {
    it("入力フィールド内で切り替えボタンを正しく配置する", () => {
      render(<AuthPasswordField name="password" label="Password" />);

      const toggleButton = screen.getByRole("button", { name: /パスワード/i });

      // 切り替えボタンは入力欄に対して相対的に配置される
      expect(toggleButton).toHaveClass("absolute", "right-3", "top-1/2");
    });

    it("入力欄のパディングを妨げない", () => {
      render(<AuthPasswordField name="password" label="Password" />);

      const passwordInput = screen.getByLabelText("Password");

      // 入力欄は切り替えボタンのためのパディングを持つ
      expect(passwordInput).toHaveClass("pr-10");
    });
  });
});
