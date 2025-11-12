/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";

import type { ParticipantView } from "@core/validation/participant-management";

import {
  buildParticipantsColumns,
  type ActionsCellHandlers,
} from "@/app/(app)/events/[id]/participants/components/participants-table-v2/columns";

// モックハンドラー
const mockHandlers: ActionsCellHandlers = {
  onReceive: jest.fn(),
  onWaive: jest.fn(),
  onCancel: jest.fn(),
  isUpdating: false,
};

const mockParticipant: ParticipantView = {
  attendance_id: "att-1",
  nickname: "テストユーザー",
  email: "test@example.com",
  status: "attending",
  attendance_created_at: "2023-01-01T00:00:00Z",
  attendance_updated_at: "2023-01-01T00:00:00Z",
  payment_id: "pay-1",
  payment_method: "cash",
  payment_status: "pending",
  amount: 1000,
  paid_at: null,
  payment_version: 1,
  payment_created_at: "2023-01-01T00:00:00Z",
  payment_updated_at: "2023-01-01T00:00:00Z",
};

// テスト用のテーブル行コンポーネント
function TestTableRow({
  participant,
  eventFee,
}: {
  participant: ParticipantView;
  eventFee: number;
}) {
  const columns = buildParticipantsColumns({
    eventFee,
    handlers: mockHandlers,
  });

  return (
    <table>
      <tbody>
        <tr>
          {columns.map((column, index) => (
            <td key={index}>
              {column.cell?.({
                row: { original: participant },
                getValue: () => participant[column.accessorKey as keyof ParticipantView],
              } as any)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

describe("buildParticipantsColumns", () => {
  describe("ニックネーム列", () => {
    it("ニックネームが正しく表示される", () => {
      render(<TestTableRow participant={mockParticipant} eventFee={1000} />);
      expect(screen.getByText("テストユーザー")).toBeInTheDocument();
    });
  });

  describe("参加状況列", () => {
    it("参加状況バッジが正しく表示される", () => {
      render(<TestTableRow participant={mockParticipant} eventFee={1000} />);
      expect(screen.getByText("参加")).toBeInTheDocument();
    });

    it("不参加の場合", () => {
      const notAttendingParticipant = { ...mockParticipant, status: "not_attending" as const };
      render(<TestTableRow participant={notAttendingParticipant} eventFee={1000} />);
      expect(screen.getByText("不参加")).toBeInTheDocument();
    });

    it("未定の場合", () => {
      const maybeParticipant = { ...mockParticipant, status: "maybe" as const };
      render(<TestTableRow participant={maybeParticipant} eventFee={1000} />);
      expect(screen.getByText("未定")).toBeInTheDocument();
    });
  });

  describe("決済方法列", () => {
    it("現金決済バッジが表示される", () => {
      render(<TestTableRow participant={mockParticipant} eventFee={1000} />);
      expect(screen.getByText("現金")).toBeInTheDocument();
    });

    it("オンライン決済バッジが表示される", () => {
      const stripeParticipant = { ...mockParticipant, payment_method: "stripe" as const };
      render(<TestTableRow participant={stripeParticipant} eventFee={1000} />);
      expect(screen.getByText("オンライン決済")).toBeInTheDocument();
    });

    it("決済方法がない場合", () => {
      const noPaymentParticipant = { ...mockParticipant, payment_method: null };
      render(<TestTableRow participant={noPaymentParticipant} eventFee={1000} />);
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });

  describe("決済状況列", () => {
    it("未決済バッジが表示される", () => {
      render(<TestTableRow participant={mockParticipant} eventFee={1000} />);
      expect(screen.getByText("未決済")).toBeInTheDocument();
    });

    it("決済済みバッジが表示される", () => {
      const paidParticipant = { ...mockParticipant, payment_status: "paid" as const };
      render(<TestTableRow participant={paidParticipant} eventFee={1000} />);
      expect(screen.getByText("決済済")).toBeInTheDocument();
    });

    it("無料イベントでは決済状況が表示されない", () => {
      render(<TestTableRow participant={mockParticipant} eventFee={0} />);
      expect(screen.getByText("-")).toBeInTheDocument();
    });
  });

  describe("アクション列", () => {
    it("現金決済で未決済の場合、受領と免除ボタンが表示される", () => {
      render(<TestTableRow participant={mockParticipant} eventFee={1000} />);

      expect(screen.getByTitle("受領済みにする")).toBeInTheDocument();
      expect(screen.getByTitle("支払いを免除")).toBeInTheDocument();
    });

    it("決済完了の場合、取り消しボタンが表示される", () => {
      const paidParticipant = { ...mockParticipant, payment_status: "received" as const };
      render(<TestTableRow participant={paidParticipant} eventFee={1000} />);

      expect(screen.getByTitle("決済を取り消し")).toBeInTheDocument();
    });

    it("オンライン決済の場合、アクションボタンが表示されない", () => {
      const stripeParticipant = { ...mockParticipant, payment_method: "stripe" as const };
      render(<TestTableRow participant={stripeParticipant} eventFee={1000} />);

      expect(screen.queryByTitle("受領済みにする")).not.toBeInTheDocument();
      expect(screen.queryByTitle("支払いを免除")).not.toBeInTheDocument();
    });

    it("受領ボタンクリックでハンドラーが呼ばれる", async () => {
      const user = userEvent.setup();
      render(<TestTableRow participant={mockParticipant} eventFee={1000} />);

      const receiveButton = screen.getByTitle("受領済みにする");
      await user.click(receiveButton);

      expect(mockHandlers.onReceive).toHaveBeenCalledWith("pay-1");
    });

    it("免除ボタンクリックでハンドラーが呼ばれる", async () => {
      const user = userEvent.setup();
      render(<TestTableRow participant={mockParticipant} eventFee={1000} />);

      const waiveButton = screen.getByTitle("支払いを免除");
      await user.click(waiveButton);

      expect(mockHandlers.onWaive).toHaveBeenCalledWith("pay-1");
    });

    it("取り消しボタンクリックでハンドラーが呼ばれる", async () => {
      const user = userEvent.setup();
      const paidParticipant = { ...mockParticipant, payment_status: "received" as const };
      render(<TestTableRow participant={paidParticipant} eventFee={1000} />);

      const cancelButton = screen.getByTitle("決済を取り消し");
      await user.click(cancelButton);

      expect(mockHandlers.onCancel).toHaveBeenCalledWith("pay-1");
    });

    it("更新中はボタンが無効になる", () => {
      const updatingHandlers = { ...mockHandlers, isUpdating: true };
      const columns = buildParticipantsColumns({
        eventFee: 1000,
        handlers: updatingHandlers,
      });

      render(
        <table>
          <tbody>
            <tr>
              <td>
                {columns[4].cell?.({
                  row: { original: mockParticipant },
                  getValue: () => undefined,
                } as any)}
              </td>
            </tr>
          </tbody>
        </table>
      );

      const receiveButton = screen.getByTitle("受領済みにする");
      expect(receiveButton).toBeDisabled();
    });
  });
});
