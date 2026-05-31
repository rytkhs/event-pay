/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { AuthSocialLoginSection } from "@features/auth";

jest.mock("@/components/auth/GoogleLoginButton", () => ({
  GoogleLoginButton: ({ label = "Googleでログイン" }: { label?: string }) => (
    <button type="submit">{label}</button>
  ),
}));

jest.mock("@/components/auth/LINELoginButton", () => ({
  LINELoginButton: ({ href, label = "LINEでログイン" }: { href: string; label?: string }) => (
    <a href={href}>{label}</a>
  ),
}));

describe("AuthSocialLoginSection", () => {
  it("passes redirect target to LINE and Google OAuth", () => {
    const googleAction = jest.fn();

    render(<AuthSocialLoginSection next="/dashboard?tab=home" googleAction={googleAction} />);

    expect(screen.getByRole("link", { name: "LINEでログイン" })).toHaveAttribute(
      "href",
      `/auth/line?next=${encodeURIComponent("/dashboard?tab=home")}`
    );
    expect(screen.getByRole("button", { name: "Googleでログイン" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("/dashboard?tab=home")).toHaveAttribute("name", "next");
  });

  it("renders OAuth error message with the existing test id", () => {
    render(
      <AuthSocialLoginSection
        next="/dashboard"
        googleAction={jest.fn()}
        oauthErrorMessage="LINE認証に失敗しました。"
      />
    );

    expect(screen.getByTestId("oauth-error-message")).toHaveTextContent(
      "LINE認証に失敗しました。"
    );
  });
});
