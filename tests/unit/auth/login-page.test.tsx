/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import { useSearchParams } from "next/navigation";

// ログインページのコンポーネントをテストするために、
// 必要なモックを設定してから、動的インポートでコンポーネントを読み込む

// next/navigationのモック
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

// Server Actionのモック
jest.mock("@core/actions/auth", () => ({
  loginAction: jest.fn(),
}));

// useLoginFormRHFのモック
jest.mock("@features/auth", () => ({
  useLoginFormRHF: jest.fn(() => ({
    form: {
      control: {},
      formState: { errors: {} },
    },
    onSubmit: jest.fn(),
    isPending: false,
  })),
}));

// コンポーネントのモック
jest.mock("@/components/auth", () => ({
  GoogleLoginButton: () => <button>Google Login</button>,
  LINELoginButton: ({ href }: { href: string }) => <a href={href}>LINE Login</a>,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h1>{children}</h1>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

jest.mock("@/components/ui/form", () => ({
  Form: ({ children }: any) => <div>{children}</div>,
  FormControl: ({ children }: any) => <div>{children}</div>,
  FormField: ({ render }: any) =>
    render({ field: { name: "test", value: "", onChange: jest.fn() } }),
  FormItem: ({ children }: any) => <div>{children}</div>,
  FormLabel: ({ children }: any) => <label>{children}</label>,
  FormMessage: () => null,
}));

jest.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock("@/components/ui/password-input", () => ({
  PasswordInput: (props: any) => <input type="password" {...props} />,
}));

// Server Actionsのモック
jest.mock("../../../app/(auth)/login/actions", () => ({
  startGoogleOAuth: jest.fn(),
}));

describe("Login Page - LINE Error Display", () => {
  const mockUseSearchParams = useSearchParams as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should display LINE email required error message", async () => {
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === "error") return "line_email_required";
        if (key === "redirectTo") return null;
        return null;
      },
    });

    // 動的インポートでコンポーネントを読み込む
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);

    // エラーメッセージが表示されることを確認
    expect(
      await screen.findByText(
        "メールアドレスが取得できませんでした。ログインをやり直してメールアドレスの提供を許可してください。"
      )
    ).toBeInTheDocument();

    // data-testidでも確認
    const errorElement = screen.getByTestId("oauth-error-message");
    expect(errorElement).toBeInTheDocument();
  });

  it("should display LINE auth failed error message", async () => {
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === "error") return "line_auth_failed";
        if (key === "redirectTo") return null;
        return null;
      },
    });

    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);

    expect(
      await screen.findByText("LINE認証に失敗しました。もう一度お試しください。")
    ).toBeInTheDocument();
  });

  it("should display LINE state mismatch error message", async () => {
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === "error") return "line_state_mismatch";
        if (key === "redirectTo") return null;
        return null;
      },
    });

    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);

    expect(
      await screen.findByText("セキュリティ検証に失敗しました。もう一度お試しください。")
    ).toBeInTheDocument();
  });

  it("should not display error message when no error param", async () => {
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === "redirectTo") return null;
        return null;
      },
    });

    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);

    // エラーメッセージが表示されないことを確認
    expect(screen.queryByTestId("oauth-error-message")).not.toBeInTheDocument();
  });
});
