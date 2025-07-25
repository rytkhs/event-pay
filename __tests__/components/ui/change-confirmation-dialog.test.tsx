/**
 * Issue 37: イベント編集フォームUI - 変更確認ダイアログテスト
 * TDD Green Phase: 実装済みコンポーネントのテスト
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// 変更確認ダイアログコンポーネントのインポート
import { ChangeConfirmationDialog, ChangeItem } from "@/components/ui/change-confirmation-dialog";

// モックデータ
const mockChanges: ChangeItem[] = [
  {
    field: "title",
    fieldName: "タイトル",
    oldValue: "テストイベント",
    newValue: "変更されたイベント",
  },
  {
    field: "description",
    fieldName: "説明",
    oldValue: "テストイベントの説明",
    newValue: "変更された説明",
  },
  {
    field: "fee",
    fieldName: "参加費",
    oldValue: "1000",
    newValue: "2000",
  },
];

const mockOnConfirm = jest.fn();
const mockOnCancel = jest.fn();

describe("変更確認機能テスト", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("変更確認ダイアログの表示", () => {
    it("ダイアログが表示される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // ダイアログが表示される
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("変更内容を確認")).toBeInTheDocument();

      // 確認とキャンセルボタンが表示される
      expect(screen.getByRole("button", { name: "変更を確定" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();
    });

    it("ダイアログのタイトルが適切に表示される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // ダイアログのタイトルが表示される
      expect(screen.getByRole("heading", { name: "変更内容を確認" })).toBeInTheDocument();
    });

    it("ダイアログが閉じられている場合、表示されない", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={false}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // ダイアログが表示されない
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("変更内容の表示", () => {
    it("変更されたフィールドが一覧表示される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 各変更項目が表示される
      expect(screen.getByText("タイトル")).toBeInTheDocument();
      expect(screen.getByText("テストイベント")).toBeInTheDocument();
      expect(screen.getByText("変更されたイベント")).toBeInTheDocument();

      expect(screen.getByText("説明")).toBeInTheDocument();
      expect(screen.getByText("テストイベントの説明")).toBeInTheDocument();
      expect(screen.getByText("変更された説明")).toBeInTheDocument();

      expect(screen.getByText("参加費")).toBeInTheDocument();
      expect(screen.getByText("1000")).toBeInTheDocument();
      expect(screen.getByText("2000")).toBeInTheDocument();

      // 変更前・変更後のラベルが存在することを確認（複数あることを想定）
      expect(screen.getAllByText("変更前:")).toHaveLength(3);
      expect(screen.getAllByText("変更後:")).toHaveLength(3);
    });

    it("変更がない場合でも適切に表示される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={[]}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // ダイアログは表示されるが変更項目は表示されない
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByText("変更される項目")).not.toBeInTheDocument();
    });
  });

  describe("ボタンの動作", () => {
    it("更新ボタンをクリックすると、onConfirmが呼ばれる", async () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      const confirmButton = screen.getByRole("button", { name: "変更を確定" });
      await userEvent.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).toHaveBeenCalledWith(mockChanges);
    });

    it("キャンセルボタンをクリックすると、onCancelが呼ばれる", async () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByRole("button", { name: "キャンセル" });
      await userEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it("ローディング中はボタンが無効になる", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
          isLoading={true}
        />
      );

      const confirmButton = screen.getByRole("button", { name: "更新中..." });
      const cancelButton = screen.getByRole("button", { name: "キャンセル" });

      expect(confirmButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
    });
  });

  describe("参加者への影響表示", () => {
    it("参加者がいる場合、警告が表示される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          attendeeCount={5}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 参加者への影響の警告が表示される
      expect(screen.getByText("参加者への影響について")).toBeInTheDocument();
      expect(screen.getByText("5人の参加者に変更が通知されます。")).toBeInTheDocument();
    });

    it("参加者がいない場合、警告が表示されない", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          attendeeCount={0}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 参加者への影響の警告が表示されない
      expect(screen.queryByText("参加者への影響について")).not.toBeInTheDocument();
    });
  });

  describe("制限項目の警告", () => {
    it("制限項目が変更される場合、警告が表示される", () => {
      const restrictedChanges: ChangeItem[] = [
        {
          field: "fee",
          fieldName: "参加費",
          oldValue: "1000",
          newValue: "2000",
        },
      ];

      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={restrictedChanges}
          attendeeCount={5}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 制限項目の警告が表示される
      expect(screen.getByText("制限項目の変更")).toBeInTheDocument();
      expect(
        screen.getByText("参加者がいる場合、通常は変更できない項目が含まれています。")
      ).toBeInTheDocument();
    });

    it("制限項目がない場合、警告が表示されない", () => {
      const nonRestrictedChanges: ChangeItem[] = [
        {
          field: "description",
          fieldName: "説明",
          oldValue: "旧説明",
          newValue: "新説明",
        },
      ];

      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={nonRestrictedChanges}
          attendeeCount={5}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 制限項目の警告が表示されない
      expect(screen.queryByText("制限項目の変更")).not.toBeInTheDocument();
    });
  });

  describe("通知メールの案内", () => {
    it("参加者がいる場合、通知メールの案内が表示される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          attendeeCount={3}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 通知メールの案内が表示される
      expect(screen.getByText("通知メールの送信")).toBeInTheDocument();
      expect(
        screen.getByText("変更内容について参加者に自動で通知メールが送信されます。")
      ).toBeInTheDocument();
    });

    it("参加者がいない場合、通知メールの案内が表示されない", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          attendeeCount={0}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 通知メールの案内が表示されない
      expect(screen.queryByText("通知メールの送信")).not.toBeInTheDocument();
    });
  });

  describe("アクセシビリティ", () => {
    it("ダイアログに適切なARIA属性が設定される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-describedby", "change-confirmation-description");
    });

    it("変更項目にtest-idが設定される", () => {
      render(
        <ChangeConfirmationDialog
          isOpen={true}
          changes={mockChanges}
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // 各変更項目にtest-idが設定される
      expect(screen.getByTestId("change-item-title")).toBeInTheDocument();
      expect(screen.getByTestId("change-item-description")).toBeInTheDocument();
      expect(screen.getByTestId("change-item-fee")).toBeInTheDocument();
    });
  });
});
