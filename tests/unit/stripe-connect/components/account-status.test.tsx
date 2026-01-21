/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { AccountStatus } from "@/features/stripe-connect/components/AccountStatus";
import type { AccountStatusData } from "@/features/stripe-connect/types/status-classification";

describe("AccountStatus Component", () => {
  const mockRefreshUrl = "/dashboard/connect/refresh";
  const mockExpressDashboardAction = jest.fn();

  describe("UI Status Rendering", () => {
    it("should render NoAccountView when uiStatus is no_account", () => {
      const status: AccountStatusData = {
        hasAccount: false,
        uiStatus: "no_account",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.getByText(/Stripeで設定を始めましょう/i)).toBeInTheDocument();
      expect(screen.getByText(/未設定/i)).toBeInTheDocument();
    });

    it("should render UnverifiedView when uiStatus is unverified", () => {
      const status: AccountStatusData = {
        hasAccount: true,
        accountId: "acct_test123",
        dbStatus: "unverified",
        uiStatus: "unverified",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.getByText(/オンボーディングを開始してください/i)).toBeInTheDocument();
      expect(screen.getByText(/未認証/i)).toBeInTheDocument();
    });

    it("should render RequirementsDueView when uiStatus is requirements_due", () => {
      const status: AccountStatusData = {
        hasAccount: true,
        accountId: "acct_test123",
        dbStatus: "onboarding",
        uiStatus: "requirements_due",
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: {
          currently_due: ["individual.verification.document"],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.getByText(/アカウント情報の更新が必要です/i)).toBeInTheDocument();
      expect(screen.getByText(/設定中/i)).toBeInTheDocument();
    });

    it("should render RestrictedView when uiStatus is restricted", () => {
      const status: AccountStatusData = {
        hasAccount: true,
        accountId: "acct_test123",
        dbStatus: "restricted",
        uiStatus: "restricted",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      // "アカウントが制限されています"というテキストが複数ある場合があるので、getAllByTextを使用
      const restrictedMessages = screen.getAllByText(/アカウントが制限されています/);
      expect(restrictedMessages.length).toBeGreaterThan(0);

      // "制限あり"というテキストが複数ある場合があるので、getAllByTextを使用
      const restrictedBadges = screen.getAllByText(/制限あり/i);
      expect(restrictedBadges.length).toBeGreaterThan(0);
    });

    it("should render ReadyView when uiStatus is ready", () => {
      const status: AccountStatusData = {
        hasAccount: true,
        accountId: "acct_test123",
        dbStatus: "verified",
        uiStatus: "ready",
        chargesEnabled: true,
        payoutsEnabled: true,
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
        capabilities: {
          card_payments: "active",
          transfers: "active",
        },
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.getByText(/設定完了！/i)).toBeInTheDocument();
      // "設定完了"というテキストが複数ある場合があるので、getAllByTextを使用
      const completedBadges = screen.getAllByText(/設定完了/i);
      expect(completedBadges.length).toBeGreaterThan(0);
    });
  });

  describe("Card Header", () => {
    it("should display card title and description", () => {
      const status: AccountStatusData = {
        hasAccount: false,
        uiStatus: "no_account",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.getByText(/Stripe 入金設定/i)).toBeInTheDocument();
      expect(screen.getByText(/売上の入金設定の状況です/i)).toBeInTheDocument();
    });

    it("should display guide link", () => {
      const status: AccountStatusData = {
        hasAccount: false,
        uiStatus: "no_account",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      const guideLink = screen.getByRole("link", { name: /設定回答の参考ページを見る/i });
      expect(guideLink).toBeInTheDocument();
      expect(guideLink).toHaveAttribute("href", "/dashboard/connect/guide");
    });

    it("should display refresh button", () => {
      const status: AccountStatusData = {
        hasAccount: false,
        uiStatus: "no_account",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      const refreshButton = screen.getByRole("button", { name: "" });
      expect(refreshButton).toBeInTheDocument();
    });
  });

  describe("Payout Status Display", () => {
    it("should display payout status when account exists", () => {
      const status: AccountStatusData = {
        hasAccount: true,
        accountId: "acct_test123",
        dbStatus: "verified",
        uiStatus: "ready",
        chargesEnabled: true,
        payoutsEnabled: true,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.getByText(/送金/i)).toBeInTheDocument();
      // "有効"というテキストが複数ある場合があるので、getAllByTextを使用
      const enabledBadges = screen.getAllByText(/有効/i);
      expect(enabledBadges.length).toBeGreaterThan(0);
    });

    it("should display disabled payout status", () => {
      const status: AccountStatusData = {
        hasAccount: true,
        accountId: "acct_test123",
        dbStatus: "onboarding",
        uiStatus: "requirements_due",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.getByText(/送金/i)).toBeInTheDocument();
      expect(screen.getByText(/無効/i)).toBeInTheDocument();
    });

    it("should not display payout status when account does not exist", () => {
      const status: AccountStatusData = {
        hasAccount: false,
        uiStatus: "no_account",
        chargesEnabled: false,
        payoutsEnabled: false,
      };

      render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

      expect(screen.queryByText(/送金/i)).not.toBeInTheDocument();
    });
  });

  describe("UI Status Badge", () => {
    it("should display correct badge for each UI status", () => {
      const statuses: Array<{
        uiStatus: AccountStatusData["uiStatus"];
        expectedText: string;
      }> = [
        { uiStatus: "no_account", expectedText: "未設定" },
        { uiStatus: "unverified", expectedText: "未認証" },
        { uiStatus: "requirements_due", expectedText: "設定中" },
        { uiStatus: "restricted", expectedText: "制限あり" },
        { uiStatus: "ready", expectedText: "設定完了" },
      ];

      statuses.forEach(({ uiStatus, expectedText }) => {
        const status: AccountStatusData = {
          hasAccount: uiStatus !== "no_account",
          accountId: uiStatus !== "no_account" ? "acct_test123" : undefined,
          dbStatus:
            uiStatus === "no_account"
              ? undefined
              : uiStatus === "unverified"
                ? "unverified"
                : uiStatus === "restricted"
                  ? "restricted"
                  : uiStatus === "ready"
                    ? "verified"
                    : "onboarding",
          uiStatus,
          chargesEnabled: uiStatus === "ready",
          payoutsEnabled: uiStatus === "ready",
        };

        const { unmount } = render(<AccountStatus refreshUrl={mockRefreshUrl} status={status} />);

        // テキストが複数ある場合があるので、getAllByTextを使用
        const badges = screen.getAllByText(expectedText);
        expect(badges.length).toBeGreaterThan(0);

        unmount();
      });
    });
  });
});
