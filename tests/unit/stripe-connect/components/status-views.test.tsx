/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  NoAccountView,
  UnverifiedView,
  RequirementsDueView,
  RestrictedView,
  ReadyView,
} from "@features/stripe-connect";
import type { AccountStatusData } from "@features/stripe-connect";

describe("Status View Components", () => {
  const mockRefreshUrl = "/dashboard/connect/refresh";
  const mockExpressDashboardAction = jest.fn();

  describe("NoAccountView", () => {
    it("should render no account message", () => {
      render(<NoAccountView refreshUrl={mockRefreshUrl} />);

      expect(screen.getByText(/Stripeで設定を始めましょう/i)).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("href", mockRefreshUrl);
    });

    it("should display setup button", () => {
      render(<NoAccountView refreshUrl={mockRefreshUrl} />);

      expect(screen.getByRole("button", { name: /Stripeで設定を始める/i })).toBeInTheDocument();
    });
  });

  describe("UnverifiedView", () => {
    it("should render unverified message", () => {
      render(<UnverifiedView refreshUrl={mockRefreshUrl} />);

      expect(screen.getByText(/オンボーディングを開始してください/i)).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("href", mockRefreshUrl);
    });

    it("should display warning alert", () => {
      render(<UnverifiedView refreshUrl={mockRefreshUrl} />);

      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  describe("RequirementsDueView", () => {
    const mockStatus: AccountStatusData = {
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
      capabilities: {
        card_payments: "pending",
        transfers: "pending",
      },
    };

    it("should render requirements due message", () => {
      const statusWithCurrentlyDue: AccountStatusData = {
        ...mockStatus,
        requirements: {
          currently_due: ["individual.verification.document"],
          eventually_due: [],
          past_due: [],
          pending_verification: [],
        },
        capabilities: {
          card_payments: "active",
          transfers: "active",
        },
      };

      render(<RequirementsDueView status={statusWithCurrentlyDue} refreshUrl={mockRefreshUrl} />);

      expect(screen.getByText(/アカウント情報の更新が必要です/i)).toBeInTheDocument();
    });

    it("should display continue button when not under review", () => {
      render(<RequirementsDueView status={mockStatus} refreshUrl={mockRefreshUrl} />);

      expect(screen.getByRole("button", { name: /Stripeで設定を続行/i })).toBeInTheDocument();
    });

    it("should display review pending message when under review", () => {
      const reviewStatus: AccountStatusData = {
        ...mockStatus,
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: ["individual.verification.document"],
        },
      };

      render(<RequirementsDueView status={reviewStatus} refreshUrl={mockRefreshUrl} />);

      expect(screen.getByText(/Stripeが提出情報を審査中です/i)).toBeInTheDocument();
    });

    it("should display dashboard button when review pending and dashboard available", () => {
      const reviewStatus: AccountStatusData = {
        ...mockStatus,
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          pending_verification: ["individual.verification.document"],
        },
      };

      render(
        <RequirementsDueView
          status={reviewStatus}
          refreshUrl={mockRefreshUrl}
          expressDashboardAction={mockExpressDashboardAction}
          expressDashboardAvailable={true}
        />
      );

      expect(
        screen.getByRole("button", { name: /Stripeダッシュボードで状況を確認/i })
      ).toBeInTheDocument();
    });

    it("should display destructive alert when past due requirements exist", () => {
      const pastDueStatus: AccountStatusData = {
        ...mockStatus,
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: ["individual.verification.document"],
          pending_verification: [],
        },
      };

      render(<RequirementsDueView status={pastDueStatus} refreshUrl={mockRefreshUrl} />);

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });
  });

  describe("RestrictedView", () => {
    it("should render restricted message", () => {
      render(<RestrictedView />);

      // 部分一致でテキストを探す（複数ある場合があるので、getAllByTextを使用）
      const restrictedMessages = screen.getAllByText(/アカウントが制限されています/);
      expect(restrictedMessages.length).toBeGreaterThan(0);
      expect(screen.getByText(/Stripeサポートにお問い合わせください/)).toBeInTheDocument();
    });

    it("should display destructive alert", () => {
      render(<RestrictedView />);

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });

    it("should not display any action buttons", () => {
      render(<RestrictedView />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  describe("ReadyView", () => {
    const mockStatus: AccountStatusData = {
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

    it("should render success message", () => {
      render(<ReadyView status={mockStatus} />);

      expect(screen.getByText(/設定完了！/i)).toBeInTheDocument();
      expect(screen.getByText(/オンライン決済が有効化されました/i)).toBeInTheDocument();
    });

    it("should display success alert", () => {
      render(<ReadyView status={mockStatus} />);

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });

    it("should display dashboard button when available", () => {
      render(
        <ReadyView
          status={mockStatus}
          expressDashboardAction={mockExpressDashboardAction}
          expressDashboardAvailable={true}
        />
      );

      expect(screen.getByRole("button", { name: /Stripeで売上・入金を確認/i })).toBeInTheDocument();
    });

    it("should not display dashboard button when not available", () => {
      render(<ReadyView status={mockStatus} expressDashboardAvailable={false} />);

      expect(
        screen.queryByRole("button", { name: /Stripeで売上・入金を確認/i })
      ).not.toBeInTheDocument();
    });
  });
});
