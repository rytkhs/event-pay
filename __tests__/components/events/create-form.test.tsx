import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { jest } from "@jest/globals";
import EventCreateForm from "@/components/events/event-form";
import {
  getFutureDatetimeLocalForTest,
  getPastDatetimeLocalForTest,
} from "@/lib/utils/test-helpers";

// Mock Server Action
const mockCreateEventAction = jest.fn() as jest.MockedFunction<
  (formData: FormData) => Promise<{ success: boolean; data?: { id: string }; error?: string }>
>;

// Supabaseの認証もmock
const mockGetUser = jest.fn();
jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

jest.mock("@/app/events/actions", () => ({
  createEventAction: mockCreateEventAction,
}));

// Mock useEventForm hook
const mockUseEventForm = jest.fn();
jest.mock("@/hooks/use-event-form", () => ({
  useEventForm: mockUseEventForm,
}));

// Mock useRouter
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock react-hook-form
const mockReset = jest.fn();
const mockSetError = jest.fn();
const mockClearErrors = jest.fn();
const mockFormState = {
  errors: {},
  isSubmitting: false,
  isValid: true,
};
const mockWatch = jest.fn();
const mockSetValue = jest.fn();
const mockGetValues = jest.fn(() => ({}));
const mockHandleSubmit = jest.fn((onSubmit) => (event) => {
  event.preventDefault();
  onSubmit(mockGetValues());
});

jest.mock("react-hook-form", () => ({
  useForm: () => ({
    register: jest.fn((name) => ({
      name,
      onBlur: jest.fn(),
      onChange: jest.fn(),
      ref: jest.fn(),
    })),
    handleSubmit: mockHandleSubmit,
    formState: mockFormState,
    watch: mockWatch,
    setValue: mockSetValue,
    getValues: mockGetValues,
    reset: mockReset,
    setError: mockSetError,
    clearErrors: mockClearErrors,
  }),
}));

// Mock useTransition
const mockStartTransition = jest.fn((callback: () => void) => {
  callback();
});
jest.mock("react", () => {
  const actual = jest.requireActual("react") as any;
  return {
    ...actual,
    useTransition: () => [false, mockStartTransition],
  };
});

describe("EventCreateForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockStartTransition.mockClear();

    // 認証済みユーザーとしてmock設定
    mockGetUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@example.com" } },
      error: null,
    });

    // Server Actionが実行されないようにする（クライアントサイドバリデーションでブロックされるはず）
    mockCreateEventAction.mockResolvedValue({ success: true, data: { id: "test-event-id" } });

    // useEventForm hook mock
    mockUseEventForm.mockReturnValue({
      form: {
        control: {},
        handleSubmit: mockHandleSubmit,
        formState: mockFormState,
        watch: mockWatch,
        setValue: mockSetValue,
        getValues: mockGetValues,
        reset: mockReset,
        setError: mockSetError,
        clearErrors: mockClearErrors,
      },
      onSubmit: jest.fn(),
      isPending: false,
      hasErrors: false,
      isFreeEvent: false,
      formData: {},
      errors: {},
    });

    // DOM要素をクリア
    document.body.innerHTML = "";
  });

  describe("必須フィールドバリデーション", () => {
    it("タイトルが空の場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      // 初期状態の確認
      expect(screen.queryByText("タイトルは必須です")).not.toBeInTheDocument();

      // タイトルフィールドを明示的に空にする
      const titleInput = screen.getByLabelText(/タイトル/i) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: "" } });

      // 値が確実にクリアされているか確認
      expect(titleInput.value).toBe("");

      // フォーム要素を取得してsubmitイベントを直接発火
      const form = document.querySelector("form");
      expect(form).toBeInTheDocument();

      // フォーム送信をトリガー
      fireEvent.submit(form!);

      // DOM更新を待つ
      await waitFor(
        () => {
          expect(
            screen.getByText("タイトルは必須です")
          ).toBeInTheDocument();
        },
        { timeout: 1000 }
      );

      // Server Actionが呼ばれていないことを確認（クライアントサイドバリデーションで止まっているはず）
      expect(mockCreateEventAction).not.toHaveBeenCalled();
    });

    it("開催日時が空の場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      // 他のフィールドも空にして、日時フィールドだけの問題に絞る
      const titleInput = screen.getByLabelText(/タイトル/i) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: "" } });

      const feeInput = screen.getByRole("spinbutton", { name: /参加費/i }) as HTMLInputElement;
      fireEvent.change(feeInput, { target: { value: "" } });

      // 開催日時フィールドを明示的に空にし、確実にクリアする
      const dateInput = screen.getByLabelText(/開催日時/i) as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: "" } });

      expect(dateInput.value).toBe("");

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(
            screen.getByText("開催日時は必須です")
          ).toBeInTheDocument();
        },
        { timeout: 1000 }
      );

      expect(mockCreateEventAction).not.toHaveBeenCalled();
    });

    it("決済方法が選択されていない場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      // 必要なフィールドを有効な値で埋める（決済方法は空のまま）
      const titleInput = screen.getByLabelText(/タイトル/i);
      fireEvent.change(titleInput, { target: { value: "テストイベント" } });

      const dateInput = screen.getByLabelText(/開催日時/i);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      fireEvent.change(dateInput, { target: { value: getFutureDatetimeLocalForTest(24) } }); // 24時間後

      const feeInput = screen.getByRole("spinbutton", { name: /参加費/i });
      fireEvent.change(feeInput, { target: { value: "1000" } });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(screen.getByText("有料イベントでは決済方法の選択が必要です")).toBeInTheDocument();
        },
        { timeout: 1000 }
      );

      expect(mockCreateEventAction).not.toHaveBeenCalled();
    });

    it("タイトルが100文字を超える場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      const titleInput = screen.getByRole("textbox", { name: /タイトル/i });
      const longTitle = "a".repeat(101);

      fireEvent.change(titleInput, { target: { value: longTitle } });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(
            screen.getByText("タイトルは100文字以内で入力してください")
          ).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it("参加費が負の数の場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      // まずStripe決済を選択
      const stripeCheckbox = screen.getByLabelText("オンライン決済（Stripe）");
      fireEvent.click(stripeCheckbox);

      // 参加費フィールドが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByRole("spinbutton", { name: /参加費/i })).toBeInTheDocument();
      });

      const feeInput = screen.getByRole("spinbutton", { name: /参加費/i });
      fireEvent.change(feeInput, { target: { value: "-100" } });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(
            screen.getByText("参加費は0以上1000000以下である必要があります")
          ).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });
  });

  describe("日付バリデーション", () => {
    it("開催日時が過去の日付の場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      const dateInput = screen.getByLabelText(/開催日時/i);
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 昨日
      const formattedDate = getPastDatetimeLocalForTest(24); // 24時間前

      fireEvent.change(dateInput, { target: { value: formattedDate } });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(
            screen.getByText("開催日時は現在時刻より後である必要があります")
          ).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it.skip("定員が負の数の場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      const capacityInput = screen.getByRole("spinbutton", { name: /定員/i });
      fireEvent.change(capacityInput, { target: { value: "-1" } });

      // フォームの状態更新を待つ
      await waitFor(() => {
        expect(capacityInput).toHaveValue(-1);
      });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(screen.getByText("定員は1以上である必要があります")).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });
  });

  describe("決済方法選択テスト", () => {
    it("決済方法が一つも選択されていない場合、エラーメッセージが表示される", async () => {
      render(<EventCreateForm />);

      // 必須フィールドに値を入力（決済方法以外）
      const titleInput = screen.getByLabelText(/タイトル/i);
      fireEvent.change(titleInput, { target: { value: "テストイベント" } });

      const dateInput = screen.getByLabelText(/開催日時/i);
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      fireEvent.change(dateInput, { target: { value: getFutureDatetimeLocalForTest(24) } }); // 24時間後

      const feeInput = screen.getByRole("spinbutton", { name: /参加費/i });
      fireEvent.change(feeInput, { target: { value: "1000" } });

      // 決済方法を一つも選択せずに送信
      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(screen.getByText("有料イベントでは決済方法の選択が必要です")).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it("決済方法セクションが有料イベント時に正しく表示される", async () => {
      render(<EventCreateForm />);

      // 必須フィールドに値を入力
      const titleInput = screen.getByLabelText(/タイトル/i);
      fireEvent.change(titleInput, { target: { value: "テストイベント" } });

      const dateInput = screen.getByLabelText(/開催日時/i);
      fireEvent.change(dateInput, { target: { value: getFutureDatetimeLocalForTest(24) } });

      // 有料イベントに設定
      const feeInput = screen.getByRole("spinbutton", { name: /参加費/i });
      fireEvent.change(feeInput, { target: { value: "1000" } });

      // 決済方法セクションが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText("利用可能な決済方法 *")).toBeInTheDocument();
        expect(screen.getByText("有料イベントでは決済方法の選択が必要です")).toBeInTheDocument();
        expect(screen.getByLabelText("オンライン決済（Stripe）")).toBeInTheDocument();
        expect(screen.getByLabelText("現金決済")).toBeInTheDocument();
      });

      // 決済方法を選択
      const stripeCheckbox = screen.getByLabelText("オンライン決済（Stripe）");
      fireEvent.click(stripeCheckbox);

      // 選択状態が正しく反映されることを確認
      expect(stripeCheckbox).toBeChecked();
    });
  });

  describe("フォーム送信テスト", () => {
    it.skip("正常なデータでフォーム送信時、createEventActionが呼び出される", async () => {
      // 成功レスポンスを設定
      mockCreateEventAction.mockResolvedValue({ success: true, data: { id: "test-event-id" } });

      render(<EventCreateForm />);

      // 必須フィールドに値を入力
      fireEvent.change(screen.getByLabelText(/タイトル/), {
        target: { value: "テストイベント" },
      });

      fireEvent.change(screen.getByLabelText(/開催日時/), {
        target: { value: "2025-12-31T10:00" },
      });

      // 参加費を入力
      fireEvent.change(screen.getByRole("spinbutton", { name: /参加費/i }), {
        target: { value: "1000" },
      });

      // 決済方法を選択
      const stripeCheckbox = screen.getByLabelText(/オンライン決済/);
      fireEvent.click(stripeCheckbox);

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(mockCreateEventAction).toHaveBeenCalledWith(expect.any(FormData));
        },
        { timeout: 1000 }
      );
    });

    it.skip("送信中はボタンが無効化される", async () => {
      // 長時間かかるmockを設定
      mockCreateEventAction.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true, data: { id: "test-event-id" } }), 100)
          )
      );

      render(<EventCreateForm />);

      // 正常なデータを入力
      fireEvent.change(screen.getByRole("textbox", { name: /タイトル/i }), {
        target: { value: "テストイベント" },
      });

      const eventDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      fireEvent.change(screen.getByLabelText(/開催日時/i), {
        target: { value: getFutureDatetimeLocalForTest(168) }, // 7日後
      });

      const stripeCheckbox = screen.getByLabelText("オンライン決済（Stripe）");
      fireEvent.click(stripeCheckbox);

      // 参加費フィールドが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByRole("spinbutton", { name: /参加費/i })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole("spinbutton", { name: /参加費/i }), {
        target: { value: "1000" },
      });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      // 短時間でボタンの状態を確認
      await waitFor(
        () => {
          expect(submitButton).toBeDisabled();
        },
        { timeout: 50 }
      );

      // ローディングテキストが表示されることを確認
      expect(screen.getByText("作成中...")).toBeInTheDocument();
    });

    it.skip("送信成功時にリダイレクトされる", async () => {
      mockCreateEventAction.mockResolvedValue({
        success: true,
        data: { id: "test-event-id" },
      });

      render(<EventCreateForm />);

      // 正常なデータを入力
      fireEvent.change(screen.getByRole("textbox", { name: /タイトル/i }), {
        target: { value: "テストイベント" },
      });

      const eventDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      fireEvent.change(screen.getByLabelText(/開催日時/i), {
        target: { value: getFutureDatetimeLocalForTest(168) }, // 7日後
      });

      const stripeCheckbox = screen.getByLabelText("オンライン決済（Stripe）");
      fireEvent.click(stripeCheckbox);

      // 参加費フィールドが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByRole("spinbutton", { name: /参加費/i })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole("spinbutton", { name: /参加費/i }), {
        target: { value: "1000" },
      });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith("/events/test-event-id");
        },
        { timeout: 1000 }
      );
    });

    it.skip("送信失敗時にエラーメッセージが表示される", async () => {
      mockCreateEventAction.mockResolvedValue({
        success: false,
        error: "イベントの作成に失敗しました",
      });

      render(<EventCreateForm />);

      // 正常なデータを入力
      fireEvent.change(screen.getByRole("textbox", { name: /タイトル/i }), {
        target: { value: "テストイベント" },
      });

      const eventDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      fireEvent.change(screen.getByLabelText(/開催日時/i), {
        target: { value: getFutureDatetimeLocalForTest(168) }, // 7日後
      });

      const stripeCheckbox = screen.getByLabelText("オンライン決済（Stripe）");
      fireEvent.click(stripeCheckbox);

      // 参加費フィールドが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByRole("spinbutton", { name: /参加費/i })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole("spinbutton", { name: /参加費/i }), {
        target: { value: "1000" },
      });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(screen.getByText("イベントの作成に失敗しました")).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it.skip("ネットワークエラー時にエラーメッセージが表示される", async () => {
      mockCreateEventAction.mockRejectedValue(new Error("ネットワークエラー"));

      render(<EventCreateForm />);

      // 正常なデータを入力
      fireEvent.change(screen.getByRole("textbox", { name: /タイトル/i }), {
        target: { value: "テストイベント" },
      });

      const eventDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      fireEvent.change(screen.getByLabelText(/開催日時/i), {
        target: { value: getFutureDatetimeLocalForTest(168) }, // 7日後
      });

      const stripeCheckbox = screen.getByLabelText("オンライン決済（Stripe）");
      fireEvent.click(stripeCheckbox);

      // 参加費フィールドが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByRole("spinbutton", { name: /参加費/i })).toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole("spinbutton", { name: /参加費/i }), {
        target: { value: "1000" },
      });

      const form = document.querySelector("form");
      fireEvent.submit(form!);

      await waitFor(
        () => {
          expect(
            screen.getByText("エラーが発生しました。もう一度お試しください。")
          ).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });
  });
});
