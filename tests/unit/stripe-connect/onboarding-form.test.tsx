/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("OnboardingForm", () => {
  const onStartOnboarding = jest.fn(async () => ({
    success: true as const,
    data: {},
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("secondaryAction が渡された場合だけ表示する", async () => {
    const { OnboardingForm } = await import("@/features/stripe-connect/components/OnboardingForm");

    render(
      <OnboardingForm
        communities={[
          {
            id: "community-1",
            name: "ボドゲ会",
            publicPageUrl: "http://localhost:3000/c/board-games",
            slug: "board-games",
          },
        ]}
        defaultRepresentativeCommunityId="community-1"
        onStartOnboarding={onStartOnboarding}
        secondaryAction={<a href="/dashboard">あとで設定する</a>}
      />
    );

    expect(screen.getByRole("link", { name: "あとで設定する" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  it("secondaryAction が未指定なら後回し導線を表示しない", async () => {
    const { OnboardingForm } = await import("@/features/stripe-connect/components/OnboardingForm");

    render(
      <OnboardingForm
        communities={[
          {
            id: "community-1",
            name: "ボドゲ会",
            publicPageUrl: "http://localhost:3000/c/board-games",
            slug: "board-games",
          },
        ]}
        defaultRepresentativeCommunityId="community-1"
        onStartOnboarding={onStartOnboarding}
      />
    );

    expect(screen.queryByText("あとで設定する")).not.toBeInTheDocument();
  });
});
