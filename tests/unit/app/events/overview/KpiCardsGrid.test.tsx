/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TooltipProvider } from "@/components/ui/tooltip";
import { KpiCardsGrid } from "@/app/(app)/events/[id]/components/overview/KpiCardsGrid";

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe("KpiCardsGrid", () => {
  function renderWithTooltip(ui: React.ReactElement) {
    return render(<TooltipProvider>{ui}</TooltipProvider>);
  }

  it("入金状況カードに主表示と補助ラベルを表示する", () => {
    renderWithTooltip(
      <KpiCardsGrid
        attendingCount={12}
        capacity={20}
        maybeCount={2}
        collectionSummary={{
          targetAmount: 9000,
          collectedAmount: 7000,
          outstandingAmount: 2000,
          exemptAmount: 1000,
          targetCount: 9,
          collectedCount: 7,
          outstandingCount: 2,
          exemptCount: 1,
          exceptionCount: 1,
        }}
        isFreeEvent={false}
      />
    );

    expect(screen.getByText("入金状況")).toBeInTheDocument();
    expect(screen.getByText("¥7,000")).toBeInTheDocument();
    expect(screen.getByText("/ ¥9,000")).toBeInTheDocument();
    expect(screen.getByText("未収 2人")).toBeInTheDocument();
    expect(screen.getByText("免除 1人")).toBeInTheDocument();
    expect(screen.getByText("要確認 1件")).toBeInTheDocument();
  });

  it("集金対象がない場合は専用表示に切り替える", () => {
    renderWithTooltip(
      <KpiCardsGrid
        attendingCount={3}
        capacity={10}
        maybeCount={0}
        collectionSummary={{
          targetAmount: 0,
          collectedAmount: 0,
          outstandingAmount: 0,
          exemptAmount: 3000,
          targetCount: 0,
          collectedCount: 0,
          outstandingCount: 0,
          exemptCount: 3,
          exceptionCount: 0,
        }}
        isFreeEvent={false}
      />
    );

    expect(screen.getAllByText("集金対象なし")).toHaveLength(2);
    expect(screen.queryByText("要確認 0件")).not.toBeInTheDocument();
  });
});
