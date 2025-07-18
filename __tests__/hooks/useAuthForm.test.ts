/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useLoginFormRHF, useRegisterFormRHF } from "@/lib/hooks/useAuthFormRHF";

// Next.js router のモック
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// Focus management のモック
jest.mock("@/lib/hooks/useFocusManagement", () => ({
  useFocusManagement: () => ({
    focusFirstError: jest.fn(),
  }),
}));

// Server Actions のモック
const mockLoginAction = jest.fn();
const mockRegisterAction = jest.fn();

const mockPush = jest.fn();
(useRouter as jest.Mock).mockReturnValue({
  push: mockPush,
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

  describe("バリデーション", () => {
    it("メールアドレスが無効な場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      await act(async () => {
        result.current.form.setValue("email", "invalid-email");
        await result.current.form.trigger("email");
      });

      expect(result.current.form.formState.errors.email).toBeDefined();
      expect(result.current.form.formState.errors.email?.message).toBe(
        "有効なメールアドレスを入力してください"
      );
    });

    it("パスワードが空の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      await act(async () => {
        result.current.form.setValue("password", "");
        await result.current.form.trigger("password");
      });

      expect(result.current.form.formState.errors.password).toBeDefined();
      expect(result.current.form.formState.errors.password?.message).toBe(
        "パスワードを入力してください"
      );
    });

    it("有効なデータでバリデーションが通る", async () => {
      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      await act(async () => {
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "password123");
        await result.current.form.trigger();
      });

      expect(result.current.form.formState.errors.email).toBeUndefined();
      expect(result.current.form.formState.errors.password).toBeUndefined();
    });
  });

  describe("フォーム送信", () => {
    it("成功時にリダイレクトが実行される", async () => {
      mockLoginAction.mockResolvedValue({
        success: true,
        redirectUrl: "/dashboard",
      });

      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      await act(async () => {
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "password123");
        await result.current.onSubmit();
      });

      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    it("エラー時にフォームエラーが設定される", async () => {
      mockLoginAction.mockResolvedValue({
        success: false,
        error: "ログインに失敗しました",
        fieldErrors: {
          email: ["メールアドレスが見つかりません"],
        },
      });

      const { result } = renderHook(() => useLoginFormRHF(mockLoginAction));

      await act(async () => {
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "password123");
        await result.current.onSubmit();
      });

      expect(result.current.form.formState.errors.root?.message).toBe("ログインに失敗しました");
      expect(result.current.form.formState.errors.email?.message).toBe(
        "メールアドレスが見つかりません"
      );
    });
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
  });

  describe("バリデーション", () => {
    it("名前が空の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("name", "");
        await result.current.form.trigger("name");
      });

      expect(result.current.form.formState.errors.name).toBeDefined();
      expect(result.current.form.formState.errors.name?.message).toBe("名前を入力してください");
    });

    it("パスワードが弱い場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("password", "weak");
        await result.current.form.trigger("password");
      });

      expect(result.current.form.formState.errors.password).toBeDefined();
      expect(result.current.form.formState.errors.password?.message).toContain("8文字以上");
    });

    it("パスワード確認が一致しない場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("password", "Password123");
        result.current.form.setValue("passwordConfirm", "DifferentPassword123");
        await result.current.form.trigger();
      });

      expect(result.current.form.formState.errors.passwordConfirm).toBeDefined();
      expect(result.current.form.formState.errors.passwordConfirm?.message).toBe(
        "パスワードが一致しません"
      );
    });

    it("利用規約に同意していない場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("termsAgreed", false);
        await result.current.form.trigger("termsAgreed");
      });

      expect(result.current.form.formState.errors.termsAgreed).toBeDefined();
      expect(result.current.form.formState.errors.termsAgreed?.message).toBe(
        "利用規約に同意してください"
      );
    });

    it("有効なデータでバリデーションが通る", async () => {
      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("name", "山田太郎");
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "Password123");
        result.current.form.setValue("passwordConfirm", "Password123");
        result.current.form.setValue("termsAgreed", true);
        await result.current.form.trigger();
      });

      expect(result.current.form.formState.errors.name).toBeUndefined();
      expect(result.current.form.formState.errors.email).toBeUndefined();
      expect(result.current.form.formState.errors.password).toBeUndefined();
      expect(result.current.form.formState.errors.passwordConfirm).toBeUndefined();
      expect(result.current.form.formState.errors.termsAgreed).toBeUndefined();
    });
  });

  describe("フォーム送信", () => {
    it("成功時にリダイレクトが実行される", async () => {
      mockRegisterAction.mockResolvedValue({
        success: true,
        redirectUrl: "/auth/verify-email",
      });

      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("name", "山田太郎");
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "Password123");
        result.current.form.setValue("passwordConfirm", "Password123");
        result.current.form.setValue("termsAgreed", true);
        await result.current.onSubmit();
      });

      expect(mockPush).toHaveBeenCalledWith("/auth/verify-email");
    });

    it("エラー時にフォームエラーが設定される", async () => {
      mockRegisterAction.mockResolvedValue({
        success: false,
        error: "会員登録に失敗しました",
        fieldErrors: {
          email: ["このメールアドレスは既に使用されています"],
        },
      });

      const { result } = renderHook(() => useRegisterFormRHF(mockRegisterAction));

      await act(async () => {
        result.current.form.setValue("name", "山田太郎");
        result.current.form.setValue("email", "test@example.com");
        result.current.form.setValue("password", "Password123");
        result.current.form.setValue("passwordConfirm", "Password123");
        result.current.form.setValue("termsAgreed", true);
        await result.current.onSubmit();
      });

      expect(result.current.form.formState.errors.root?.message).toBe("会員登録に失敗しました");
      expect(result.current.form.formState.errors.email?.message).toBe(
        "このメールアドレスは既に使用されています"
      );
    });
  });
});
