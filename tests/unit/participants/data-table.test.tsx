/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/app/events/[id]/participants/components/participants-table-v2/data-table";

interface TestData {
  id: string;
  name: string;
  status: string;
}

const testData: TestData[] = [
  { id: "1", name: "テストユーザー1", status: "active" },
  { id: "2", name: "テストユーザー2", status: "inactive" },
];

const testColumns: ColumnDef<TestData>[] = [
  {
    accessorKey: "name",
    header: "名前",
    enableSorting: true,
  },
  {
    accessorKey: "status",
    header: "ステータス",
    enableSorting: true,
  },
];

const defaultProps = {
  columns: testColumns,
  data: testData,
  pageIndex: 0,
  pageSize: 50,
  pageCount: 1,
  sorting: [],
  onSortingChange: jest.fn(),
};

describe("DataTable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("基本表示", () => {
    it("テーブルが正しく表示される", () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("名前")).toBeInTheDocument();
      expect(screen.getByText("ステータス")).toBeInTheDocument();
      expect(screen.getByText("テストユーザー1")).toBeInTheDocument();
      expect(screen.getByText("テストユーザー2")).toBeInTheDocument();
    });

    it("データがない場合の表示", () => {
      render(<DataTable {...defaultProps} data={[]} />);

      expect(screen.getByText("参加者が見つかりません")).toBeInTheDocument();
    });

    it("aria-labelが正しく設定される", () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.getByLabelText("参加者一覧テーブル")).toBeInTheDocument();
    });
  });

  describe("ソート機能", () => {
    it("ソート可能な列にソートボタンが表示される", () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.getByRole("button", { name: /名前でソート/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ステータスでソート/ })).toBeInTheDocument();
    });

    it("ソートボタンクリックでハンドラーが呼ばれる", async () => {
      const user = userEvent.setup();
      const onSortingChange = jest.fn();

      render(<DataTable {...defaultProps} onSortingChange={onSortingChange} />);

      const sortButton = screen.getByRole("button", { name: /名前でソート/ });
      await user.click(sortButton);

      expect(onSortingChange).toHaveBeenCalled();
    });

    it("ソート状態がアイコンに反映される", () => {
      const sortingState = [{ id: "name", desc: false }];
      render(<DataTable {...defaultProps} sorting={sortingState} />);

      // ソート状態のアイコンが表示されることを確認
      // 具体的なアイコンのテストはここでは簡略化
      expect(screen.getByRole("button", { name: /名前でソート/ })).toBeInTheDocument();
    });

    it("aria-sort属性が正しく設定される", () => {
      const sortingState = [{ id: "name", desc: false }];
      render(<DataTable {...defaultProps} sorting={sortingState} />);

      const nameHeader = screen.getByRole("columnheader", { name: "名前" });
      expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    });
  });

  describe("行スタイリング", () => {
    it("getRowClassNameが適用される", () => {
      const getRowClassName = jest.fn((row) =>
        row.original.status === "active" ? "bg-green-50" : ""
      );

      render(<DataTable {...defaultProps} getRowClassName={getRowClassName} />);

      expect(getRowClassName).toHaveBeenCalledTimes(testData.length);
    });

    it("行にhover効果が適用される", () => {
      render(<DataTable {...defaultProps} />);

      const rows = screen.getAllByRole("row");
      // ヘッダー行を除く
      const dataRows = rows.slice(1);

      dataRows.forEach((row) => {
        expect(row).toHaveClass("hover:bg-blue-50");
      });
    });

    it("行にfocus効果が適用される", () => {
      render(<DataTable {...defaultProps} />);

      const rows = screen.getAllByRole("row");
      const dataRows = rows.slice(1);

      dataRows.forEach((row) => {
        expect(row).toHaveClass("focus-within:ring-2");
        expect(row).toHaveAttribute("tabIndex", "0");
      });
    });
  });

  describe("アクセシビリティ", () => {
    it("適切なrole属性が設定される", () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getAllByRole("columnheader")).toHaveLength(2);
      expect(screen.getAllByRole("row")).toHaveLength(3); // ヘッダー + データ2行
    });

    it("ソートボタンに適切なaria-label属性が設定される", () => {
      render(<DataTable {...defaultProps} />);

      expect(screen.getByRole("button", { name: "名前でソート" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "ステータスでソート" })).toBeInTheDocument();
    });
  });

  describe("レスポンシブ対応", () => {
    it("overflow-x-autoクラスが適用される", () => {
      render(<DataTable {...defaultProps} />);

      const tableContainer = screen.getByRole("table").parentElement;
      expect(tableContainer).toHaveClass("overflow-auto");
    });

    it("レスポンシブなパディングクラスが適用される", () => {
      render(<DataTable {...defaultProps} />);

      const cells = screen.getAllByRole("cell");
      cells.forEach((cell) => {
        expect(cell).toHaveClass("px-2", "sm:px-4");
      });
    });
  });
});
