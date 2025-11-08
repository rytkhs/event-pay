/**
 * テスト用フォームデータヘルパー
 *
 * テストで使用するフォームデータ作成関数を提供
 */

/**
 * 汎用的なFormDataを作成（任意のキー・値のペアをFormDataに変換）
 *
 * 空文字送信・配列はカンマ区切り、booleanは文字列に変換
 *
 * @param payload キー・値のペア
 * @returns FormDataオブジェクト
 */
export function buildFormData(payload: Record<string, any>): FormData {
  const fd = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length === 0) fd.append(key, "");
      else fd.append(key, value.join(","));
    } else if (typeof value === "boolean") {
      fd.append(key, String(value));
    } else if (value === "" || value === null || value === undefined) {
      // クリア意図は空文字として送信
      fd.append(key, "");
    } else {
      fd.append(key, value);
    }
  });
  return fd;
}

/**
 * イベント作成用のFormDataを作成
 *
 * @param eventData イベントデータ
 * @returns FormDataオブジェクト
 */
export function createFormDataFromEvent(eventData: {
  title: string;
  date: string;
  fee: string;
  payment_methods?: string[];
  location?: string;
  description?: string;
  capacity?: string;
  registration_deadline?: string;
  payment_deadline?: string;
  allow_payment_after_deadline?: boolean;
  grace_period_days?: string;
}): FormData {
  const formData = new FormData();

  formData.append("title", eventData.title);
  formData.append("date", eventData.date);
  formData.append("fee", eventData.fee);

  // 決済方法（配列から文字列に変換）
  if (eventData.payment_methods) {
    formData.append("payment_methods", eventData.payment_methods.join(","));
  } else {
    formData.append("payment_methods", "");
  }

  // オプショナルフィールド
  if (eventData.location) {
    formData.append("location", eventData.location);
  }
  if (eventData.description) {
    formData.append("description", eventData.description);
  }
  if (eventData.capacity) {
    formData.append("capacity", eventData.capacity);
  }
  if (eventData.registration_deadline) {
    formData.append("registration_deadline", eventData.registration_deadline);
  }
  if (eventData.payment_deadline) {
    formData.append("payment_deadline", eventData.payment_deadline);
  }
  if (eventData.allow_payment_after_deadline) {
    formData.append("allow_payment_after_deadline", String(eventData.allow_payment_after_deadline));
  }
  if (eventData.grace_period_days) {
    formData.append("grace_period_days", eventData.grace_period_days);
  }

  return formData;
}
