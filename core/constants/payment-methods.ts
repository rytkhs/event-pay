import { Database } from "@/types/database";

// データベースのenumと完全に一致させる
export const PAYMENT_METHODS = ["stripe", "cash"] as const;

// データベース型定義を使用して型安全性を保証
export type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "オンライン決済",
  cash: "現金決済",
};
