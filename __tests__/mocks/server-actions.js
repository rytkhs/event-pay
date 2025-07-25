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
      redirectUrl: "/home",
    };
  }

  // デフォルトは失敗
  return {
    success: false,
    error: "メールアドレスまたはパスワードが正しくありません",
  };
});

// 登録アクション（セキュリティバリデーション付き）
export const registerAction = jest.fn().mockImplementation(async (formData) => {
  const email = formData.get("email");
  const password = formData.get("password");
  const name = formData.get("name");
  const passwordConfirm = formData.get("passwordConfirm");
  const termsAgreed = formData.get("termsAgreed");

  // バリデーションエラーを格納
  const fieldErrors = {};

  // 名前のバリデーション（実際のZodバリデーションロジックを模倣）
  if (!name || typeof name !== "string") {
    fieldErrors.name = ["名前を入力してください"];
  } else {
    const trimmedName = name.trim();

    // 空白のみの場合
    if (trimmedName.length === 0) {
      fieldErrors.name = ["名前を入力してください"];
    }
    // 長さチェック
    else if (trimmedName.length > 100) {
      fieldErrors.name = ["名前は100文字以内で入力してください"];
    }
    // 危険文字チェック
    else if (/[;&|`$(){}[\]<>\\]/.test(trimmedName)) {
      fieldErrors.name = ["名前に無効な文字が含まれています"];
    }
    // コマンドインジェクション対策
    else if (
      /^\s*(rm|cat|echo|whoami|id|ls|pwd|sudo|su|curl|wget|nc|nmap|chmod|chown|kill|ps|top|netstat|find|grep|awk|sed|tail|head|sort|uniq)\s+/.test(
        trimmedName
      )
    ) {
      fieldErrors.name = ["名前に無効な文字が含まれています"];
    }
    // NULL文字・制御文字チェック
    else if (trimmedName.includes("\0") || trimmedName.includes("\x1a")) {
      fieldErrors.name = ["名前に無効な文字が含まれています"];
    }
  }

  // メールのバリデーション
  if (!email || typeof email !== "string") {
    fieldErrors.email = ["有効なメールアドレスを入力してください"];
  } else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    fieldErrors.email = ["有効なメールアドレスを入力してください"];
  } else if (email.length > 254) {
    fieldErrors.email = ["メールアドレスが長すぎます"];
  }

  // パスワードのバリデーション
  if (!password || typeof password !== "string") {
    fieldErrors.password = ["パスワードを入力してください"];
  } else if (password.length < 8) {
    fieldErrors.password = ["パスワードは8文字以上で入力してください"];
  } else if (password.length > 128) {
    fieldErrors.password = ["パスワードが長すぎます"];
  } else if (!/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/.test(password)) {
    fieldErrors.password = ["パスワードは大文字・小文字・数字を含む必要があります"];
  }

  // パスワード確認のバリデーション
  if (!passwordConfirm || typeof passwordConfirm !== "string") {
    fieldErrors.passwordConfirm = ["パスワード確認を入力してください"];
  } else if (password !== passwordConfirm) {
    fieldErrors.passwordConfirm = ["パスワードが一致しません"];
  }

  // 利用規約同意のバリデーション
  if (!termsAgreed || termsAgreed !== "true") {
    fieldErrors.termsAgreed = ["利用規約に同意してください"];
  }

  // バリデーションエラーがある場合は失敗
  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors,
      error: "入力内容を確認してください",
    };
  }

  // 既存メールアドレスチェック
  if (email === "existing@example.com") {
    return {
      success: false,
      error: "このメールアドレスは既に登録されています",
    };
  }

  return {
    success: true,
    data: { user: { id: "new-user-id", email } },
    needsVerification: true,
    message: "登録が完了しました。確認メールを送信しました。",
    redirectUrl: `/verify-otp?email=${encodeURIComponent(email)}`,
  };
});

// ログアウトアクション
export const logoutAction = jest.fn().mockImplementation(async () => {
  return {
    success: true,
    message: "ログアウトしました",
    redirectUrl: "/login",
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
