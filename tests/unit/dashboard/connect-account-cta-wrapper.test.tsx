/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { ConnectAccountCtaWrapper } from "@/app/(app)/dashboard/components/ConnectAccountCtaWrapper";

jest.mock("@features/stripe-connect", () => ({
  ConnectAccountCta: ({ status }: { status: { title: string } }) => (
    <div data-testid="connect-account-cta">{status.title}</div>
  ),
}));

describe("ConnectAccountCtaWrapper", () => {
  it("renders the CTA when balance loading fails but CTA status resolves", async () => {
    const rejectedBalance = Promise.reject(new Error("stripe down"));
    rejectedBalance.catch(() => undefined);

    const ui = await ConnectAccountCtaWrapper({
      dashboardDataResource: Promise.resolve({
        stats: Promise.resolve({} as never),
        recentEvents: Promise.resolve([]),
        stripeBalance: rejectedBalance,
        stripeCtaStatus: Promise.resolve({
          statusType: "requirements_due",
          severity: "warning",
          title: "決済機能はまだ利用開始前です",
          description: "追加情報が必要です",
          actionText: "状況を確認",
          actionUrl: "/settings/payments",
        }),
      }),
    });

    render(ui);

    expect(screen.getByTestId("connect-account-cta")).toHaveTextContent(
      "決済機能はまだ利用開始前です"
    );
  });

  it("returns null when CTA status is unavailable", async () => {
    const ui = await ConnectAccountCtaWrapper({
      dashboardDataResource: Promise.resolve({
        stats: Promise.resolve({} as never),
        recentEvents: Promise.resolve([]),
        stripeBalance: Promise.resolve(0),
        stripeCtaStatus: Promise.resolve(undefined),
      }),
    });

    expect(ui).toBeNull();
  });
});
