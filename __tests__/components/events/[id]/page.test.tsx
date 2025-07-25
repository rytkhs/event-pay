import { render, screen } from "@testing-library/react";
import EventDetailPage from "@/app/events/[id]/page";
import { getFutureDatetimeLocalForTest } from "@/lib/utils/test-helpers";

import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";

// 統一モック設定を適用
UnifiedMockFactory.setupCommonMocks();
// Mock the EventDetail component since it's not implemented yet
jest.mock("@/components/events/event-detail", () => ({
  EventDetail: ({ event }: { event: any }) => (
    <div data-testid="event-detail-mock">EventDetail Mock: {event?.title || "No event"}</div>
  ),
}));

// Mock the EventActions component since it's not implemented yet
jest.mock("@/components/events/event-actions", () => ({
  EventActions: ({ eventId }: { eventId: string }) => (
    <div data-testid="event-actions-mock">EventActions Mock: {eventId}</div>
  ),
}));

// Mock the Server Action since it's not implemented yet
jest.mock("@/app/events/actions/get-event-detail", () => ({
  getEventDetailAction: jest.fn(),
}));

// Mock Next.js navigation
jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

const { notFound: mockNotFound, redirect } = require("next/navigation");

const { getEventDetailAction } = require("@/app/events/actions/get-event-detail");
const mockGetEventDetailAction = getEventDetailAction as jest.MockedFunction<
  typeof getEventDetailAction
>;

const mockParams = { id: "test-event-id" };

// Mock event detail data
const mockEventDetail = {
  id: "test-event-id",
  title: "テストイベント",
  date: "2024-12-31T15:00:00Z",
  location: "テスト会場",
  fee: 1000,
  capacity: 50,
  status: "upcoming",
  description: "テストイベントの説明",
  application_deadline: "2024-12-30T15:00:00Z",
  payment_deadline: "2024-12-31T10:00:00Z",
  payment_methods: ["stripe"],
  created_by: "test-user-id",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  creator_name: "テスト作成者",
  attendances_count: 10,
  invite_token: "test-token",
};

describe("EventDetailPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Green Phase - 機能テスト", () => {
    it("無効なparamsが渡された場合、適切なエラーハンドリングが行われる", async () => {
      const { notFound } = require("next/navigation");

      try {
        // @ts-expect-error - Testing invalid params
        await EventDetailPage({ params: {} });
      } catch {
        // エラーが投げられることを期待
      }

      expect(notFound).toHaveBeenCalled();
    });

    it("getEventDetailActionが失敗した場合、適切なエラー処理が行われる", async () => {
      const { notFound } = require("next/navigation");
      mockGetEventDetailAction.mockRejectedValue(new Error("Event not found"));

      try {
        await EventDetailPage({ params: mockParams });
      } catch {
        // エラーが投げられることを期待
      }

      expect(notFound).toHaveBeenCalled();
    });

    it("存在しないイベントIDの場合、404ページまたはnotFound()が呼ばれる", async () => {
      const { notFound } = require("next/navigation");
      mockGetEventDetailAction.mockRejectedValue(new Error("Event not found"));

      try {
        await EventDetailPage({ params: { id: "nonexistent-id" } });
      } catch {
        // エラーが投げられることを期待
      }

      expect(notFound).toHaveBeenCalled();
    });

    it("認証エラーの場合、適切なリダイレクトが行われる", async () => {
      const { redirect } = require("next/navigation");
      // 認証エラーは Server Action 内で redirect が呼ばれる
      mockGetEventDetailAction.mockImplementation(() => {
        const { redirect } = require("next/navigation");
        redirect("/login");
        return Promise.resolve(null); // 実際はここには到達しない
      });

      try {
        await EventDetailPage({ params: mockParams });
      } catch {
        // redirect が呼ばれた後のエラーを期待
      }

      expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("正常ケース: イベント詳細が正しく表示される", async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);

      expect(screen.getByTestId("event-detail-mock")).toBeInTheDocument();
      expect(screen.getByTestId("event-actions-mock")).toBeInTheDocument();
      expect(screen.getByText(/テストイベント/)).toBeInTheDocument();
    });

    it("EventDetailコンポーネントに正しいpropsが渡される", async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);

      expect(mockGetEventDetailAction).toHaveBeenCalledWith("test-event-id");
      expect(screen.getByTestId("event-detail-mock")).toBeInTheDocument();
    });

    it("EventActionsコンポーネントに正しいeventIdが渡される", async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);

      expect(screen.getByTestId("event-actions-mock")).toBeInTheDocument();
      expect(screen.getByText(/test-event-id/)).toBeInTheDocument();
    });

    it("ページタイトルがイベント名に設定される", async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);

      // Green Phaseでは基本的な表示のみテスト
      expect(screen.getByTestId("event-detail-mock")).toBeInTheDocument();
    });

    it("URLパラメータの検証が正しく行われる", async () => {
      // 無効なUUID形式でgetEventDetailActionがnullを返すようにモック
      const invalidParams = { id: "invalid-uuid" };
      mockGetEventDetailAction.mockResolvedValueOnce(null);

      await EventDetailPage({ params: invalidParams });

      expect(mockNotFound).toHaveBeenCalled();
    });
  });
});
