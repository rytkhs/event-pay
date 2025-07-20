/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useLoginFormRHF, useRegisterFormRHF } from "@/lib/hooks/useAuthForm";

// Next.js router のモック
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// モックの設定
const mockPush = jest.fn();
const mockLoginAction = jest.fn();
const mockRegisterAction = jest.fn();

beforeEach(() => {
  const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
  mockUseRouter.mockReturnValue({
    push: mockPush,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  });
  jest.clearAllMocks();
});

describe("useLoginFormRHF", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("初期化", () => {
    it("正しいデフォルト値で初期化される", () => {
      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      const formData = result.current.form.getValues();

      expect(formData.email).toBe("");
      expect(formData.password).toBe("");
      expect(formData.rememberMe).toBe(false);
    });

    it("isPendingが正しく初期化される", () => {
      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      expect(result.current.isPending).toBe(false);
    });
  });

  describe("フォーム送信", () => {
    it("成功時にリダイレクトが実行される", async () => {
      mockLoginAction.mockResolvedValue({
        success: true,
        redirectUrl: "/home",
      });

      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      await act(async () => {
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "password123");

        await result.current.onSubmit();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/home");
      });
    });

    // エラーハンドリングのテストは統合テストに移譲
    // 参照: __tests__/integration/auth-form.integration.test.tsx
  });
});

describe("useRegisterFormRHF", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("初期化", () => {
    it("正しいデフォルト値で初期化される", () => {
      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      const formData = result.current.form.getValues();

      expect(formData.name).toBe("");
      expect(formData.email).toBe("");
      expect(formData.password).toBe("");
      expect(formData.passwordConfirm).toBe("");
      expect(formData.termsAgreed).toBe(false);
    });

    it("isPendingが正しく初期化される", () => {
      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      expect(result.current.isPending).toBe(false);
    });
  });

  describe("フォーム送信", () => {
    it("成功時にリダイレクトが実行される", async () => {
      mockRegisterAction.mockResolvedValue({
        success: true,
        redirectUrl: "/home",
      });

      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("name", "Test User");
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "Password123");
        result.current.form.setValue("passwordConfirm", "Password123");
        result.current.form.setValue("termsAgreed", true);

        await result.current.onSubmit();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/home");
      });
    });

    // エラーハンドリングのテストは統合テストに移譲
    // 参照: __tests__/integration/auth-form.integration.test.tsx

    it("メール確認が必要な場合、適切なページにリダイレクトされる", async () => {
      mockRegisterAction.mockResolvedValue({
        success: true,
        needsEmailConfirmation: true,
        redirectUrl: "/auth/verify-email",
      });

      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("name", "Test User");
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "Password123");
        result.current.form.setValue("passwordConfirm", "Password123");
        result.current.form.setValue("termsAgreed", true);

        await result.current.onSubmit();
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/auth/verify-email");
      });
    });
  });
});

// 複雑なバリデーションテストは統合テストに移譲
// 参照: __tests__/integration/auth-form.integration.test.tsx
