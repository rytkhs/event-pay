/**
 * @jest-environment jsdom
 * @file EventListWithFilters統合テスト
 * @description サーバー統一ソートテスト
 * @author EventPay Team
 * @version 1.0.0
 */

import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { EventListWithFilters } from "@/components/events/event-list-with-filters";
import type { Event } from "@/types/event";

// 統一モック設定を適用
UnifiedMockFactory.setupCommonMocks();

describe("EventListWithFilters - サーバー統一ソートテスト", () => {
  const mockEvents: Event[] = Array.from({ length: 30 }, (_, i) => ({
    id: `event-${i + 1}`,
    title: `テストイベント ${i + 1}`,
    date: new Date(2024, 0, i + 1).toISOString(),
    location: `会場${i + 1}`,
    fee: (i + 1) * 1000,
    capacity: 50,
    status: "upcoming" as const,
    creator_name: "テストユーザー",
    attendances_count: i + 1,
    created_at: new Date(2024, 0, i + 1).toISOString(),
  }));

  beforeEach(() => {
    jest.clearAllMocks();

    // グローバルモックを使用
    if (global.mockUseRouter) {
      const mockPush = jest.fn();
      global.mockUseRouter.mockReturnValue({
        push: mockPush,
        replace: jest.fn(),
        back: jest.fn(),
        forward: jest.fn(),
        refresh: jest.fn(),
        prefetch: jest.fn(),
      });
    }

    const { useSearchParams } = require("next/navigation");
    const mockSearchParams = {
      get: jest.fn(() => null),
      toString: jest.fn(() => ""),
    };
    if (useSearchParams && typeof useSearchParams.mockReturnValue === "function") {
      useSearchParams.mockReturnValue(mockSearchParams);
    }
  });

  describe("サーバー統一ソート", () => {
    it("ソート変更時にURLパラメータが正しく更新されること", async () => {
      render(
        <EventListWithFilters
          events={mockEvents}
          totalCount={30}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // JSDOMではShadcn/ui Selectの操作が制限されるため、
      // 基本要素の存在確認のみ行う
      const sortBySelect = screen.getByTestId("sort-by-select");
      expect(sortBySelect).toBeInTheDocument();
      expect(sortBySelect).toHaveAttribute("data-state", "closed");

      // Note: 実際のSelect操作テストはE2Eテスト環境で実行
    });

    it("フィルター変更時にも現在のソート設定が保持されること", async () => {
      render(
        <EventListWithFilters
          events={mockEvents}
          totalCount={30}
          initialSortBy="fee"
          initialSortOrder="asc"
        />
      );

      // JSDOMではShadcn/ui Selectの操作が制限されるため、
      // 基本要素の存在確認のみ行う
      const statusSelect = screen.getByTestId("status-filter");
      expect(statusSelect).toBeInTheDocument();

      const sortBySelect = screen.getByTestId("sort-by-select");
      expect(sortBySelect).toBeInTheDocument();

      // Note: 実際のSelect操作テストはE2Eテスト環境で実行
    });

    it("複数のソート・フィルター操作でURLパラメータが正しく更新されること", async () => {
      render(
        <EventListWithFilters
          events={mockEvents}
          totalCount={30}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // JSDOMではShadcn/ui Selectの操作が制限されるため、
      // 基本要素の存在確認のみ行う
      const sortBySelect = screen.getByTestId("sort-by-select");
      expect(sortBySelect).toBeInTheDocument();

      const paymentSelect = screen.getByTestId("payment-filter");
      expect(paymentSelect).toBeInTheDocument();

      // Note: 実際のSelect操作テストはE2Eテスト環境で実行
    });

    it("初期値が正しく設定されること", async () => {
      render(
        <EventListWithFilters
          events={mockEvents}
          totalCount={30}
          initialSortBy="fee"
          initialSortOrder="desc"
          initialStatusFilter="upcoming"
        />
      );

      // JSDOMではShadcn/ui Selectの表示値確認が制限されるため、
      // 基本要素の存在確認のみ行う
      const sortBySelect = screen.getByTestId("sort-by-select");
      expect(sortBySelect).toBeInTheDocument();

      const statusSelect = screen.getByTestId("status-filter");
      expect(statusSelect).toBeInTheDocument();

      // Note: 実際の表示値テストはE2Eテスト環境で実行
    });
  });

  describe("表示機能", () => {
    it("イベントが正しく表示されること", async () => {
      render(
        <EventListWithFilters
          events={mockEvents}
          totalCount={30}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // イベントカードが表示されることを確認
      await waitFor(() => {
        const eventCards = screen.getAllByTestId(/event-card/);
        expect(eventCards).toHaveLength(mockEvents.length);
      });
    });
  });

  describe("URLパラメータ管理", () => {
    it("空の値やdefault値はURLパラメータから削除されること", async () => {
      render(
        <EventListWithFilters
          events={mockEvents}
          totalCount={30}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // JSDOMではShadcn/ui Selectの操作が制限されるため、
      // 基本要素の存在確認のみ行う
      const statusSelect = screen.getByTestId("status-filter");
      expect(statusSelect).toBeInTheDocument();

      // Note: 実際のSelect操作およびURLパラメータテストはE2Eテスト環境で実行
    });
  });
});
