// Server Actions用のモックファイル
// 統合テストで使用するServer Actionsのモック

// ログインアクション
export const loginAction = jest.fn().mockImplementation(async (formData) => {
  const email = formData.get("email");
  const password = formData.get("password");

  // テスト用の条件分岐
  if (email === "invalid@example.com" || password === "wrongpassword") {
    return {
      success: false,
      error: "メールアドレスまたはパスワードが正しくありません",
    };
  }

  if (email === "user@example.com" && password === "userpassword") {
    return {
      success: false,
      error: "メールアドレスまたはパスワードが正しくありません",
    };
  }

  if (email === "valid@example.com" && password === "validpassword") {
    return {
      success: true,
      data: { user: { id: "test-user-id", email: "valid@example.com" } },
      message: "ログインしました",
      redirectUrl: "/dashboard",
    };
  }

  // デフォルトは失敗
  return {
    success: false,
    error: "メールアドレスまたはパスワードが正しくありません",
  };
});

// 登録アクション
export const registerAction = jest.fn().mockImplementation(async (formData) => {
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("name");
  const termsAgreed = formData.get("termsAgreed");

  if (!termsAgreed) {
    return {
      success: false,
      fieldErrors: {
        termsAgreed: ["利用規約に同意してください"],
      },
      error: "利用規約に同意してください",
    };
  }

  if (email === "existing@example.com") {
    return {
      success: false,
      error: "このメールアドレスは既に登録されています",
    };
  }

  return {
    success: true,
    data: { user: { id: "new-user-id", email } },
    message: "ユーザー登録が完了しました。確認メールを送信しました。",
    redirectUrl: "/auth/verify-email",
  };
});

// ログアウトアクション
export const logoutAction = jest.fn().mockImplementation(async () => {
  return {
    success: true,
    message: "ログアウトしました",
    redirectUrl: "/auth/login",
  };
});

// OTP検証アクション
export const verifyOtpAction = jest.fn().mockImplementation(async (formData) => {
  const otp = formData.get("otp");
  const email = formData.get("email");

  if (otp === "123456") {
    return {
      success: true,
      message: "メールアドレスが確認されました",
      redirectUrl: "/dashboard",
    };
  }

  return {
    success: false,
    error: "確認コードが正しくありません",
  };
});

// パスワードリセットアクション
export const resetPasswordAction = jest.fn().mockImplementation(async (formData) => {
  const email = formData.get("email");

  if (email === "nonexistent@example.com") {
    return {
      success: false,
      error: "メールアドレスが見つかりません",
    };
  }

  return {
    success: true,
    message: "パスワードリセットメールを送信しました",
  };
});

// イベント作成アクション
export const createEventAction = jest.fn().mockImplementation(async (formData) => {
  const title = formData.get("title");
  const date = formData.get("date");

  if (!title || !date) {
    return {
      success: false,
      error: "必須フィールドを入力してください",
    };
  }

  return {
    success: true,
    data: { id: "test-event-id", title, date },
    message: "イベントが作成されました",
    redirectUrl: "/events/test-event-id",
  };
});

// イベント更新アクション
export const updateEventAction = jest.fn().mockImplementation(async (formData) => {
  const id = formData.get("id");
  const title = formData.get("title");

  if (!id) {
    return {
      success: false,
      error: "イベントIDが必要です",
    };
  }

  if (id === "nonexistent-id") {
    return {
      success: false,
      error: "イベントが見つかりません",
    };
  }

  return {
    success: true,
    data: { id, title },
    message: "イベントが更新されました",
  };
});

// イベント削除アクション
export const deleteEventAction = jest.fn().mockImplementation(async (formData) => {
  const id = formData.get("id");

  if (!id) {
    return {
      success: false,
      error: "イベントIDが必要です",
    };
  }

  if (id === "nonexistent-id") {
    return {
      success: false,
      error: "イベントが見つかりません",
    };
  }

  return {
    success: true,
    message: "イベントが削除されました",
    redirectUrl: "/events",
  };
});

// 参加申し込みアクション
export const registerAttendanceAction = jest.fn().mockImplementation(async (formData) => {
  const eventId = formData.get("eventId");
  const userId = formData.get("userId");

  if (!eventId || !userId) {
    return {
      success: false,
      error: "必須パラメータが不足しています",
    };
  }

  if (eventId === "full-event-id") {
    return {
      success: false,
      error: "イベントは満員です",
    };
  }

  return {
    success: true,
    data: { eventId, userId, status: "confirmed" },
    message: "参加申し込みが完了しました",
  };
});

// 決済処理アクション
export const processPaymentAction = jest.fn().mockImplementation(async (formData) => {
  const eventId = formData.get("eventId");
  const paymentMethod = formData.get("paymentMethod");
  const amount = formData.get("amount");

  if (!eventId || !paymentMethod || !amount) {
    return {
      success: false,
      error: "必須パラメータが不足しています",
    };
  }

  if (paymentMethod === "stripe" && amount > 100000) {
    return {
      success: false,
      error: "決済金額が上限を超えています",
    };
  }

  return {
    success: true,
    data: { eventId, paymentMethod, amount, paymentId: "test-payment-id" },
    message: "決済が完了しました",
  };
});

// デフォルトエクスポート
export default {
  loginAction,
  registerAction,
  logoutAction,
  verifyOtpAction,
  resetPasswordAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  registerAttendanceAction,
  processPaymentAction,
};
