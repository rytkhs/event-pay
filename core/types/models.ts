/**
 * EventPay 統一型定義
 * アプリケーション全体で使用される共通の型定義を集約
 */

import type { Database } from "@/types/database";

// ====================================================================
// Event関連の型定義
// ====================================================================

/**
 * イベント基本情報型
 * データベースのeventsテーブルに対応
 */
export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  fee: number;
  capacity: number | null;
  status: "upcoming" | "ongoing" | "past" | "canceled"; // 算出値（DBカラムではない）
  payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
  registration_deadline: string | null;
  payment_deadline: string | null;
  allow_payment_after_deadline: boolean;
  grace_period_days: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  invite_token: string | null;
  canceled_at?: string | null;
  // 関連データ（JOINで取得される場合）
  creator_name?: string;
  attendances_count?: number;
  attendances?: Array<{ id: string }>;
}

/**
 * イベント詳細表示用型
 * UIコンポーネントで使用される拡張された型
 */
export interface EventDetail extends Event {
  creator_name: string; // 必須
  attendances_count: number; // 必須
}

/**
 * イベント作成・更新用型
 * フォームデータに対応（既存実装用）
 */
export interface EventFormData {
  title: string;
  description: string;
  location: string;
  date: string;
  fee: string; // フォームでは文字列
  capacity: string; // フォームでは文字列
  payment_methods: string[]; // 既存実装では配列
  registration_deadline: string;
  payment_deadline: string;
  allow_payment_after_deadline?: boolean;
  grace_period_days?: string; // 数値入力だがフォームでは文字列
}

// ====================================================================
// Attendance関連の型定義
// ====================================================================

/**
 * 参加情報型
 */
export interface Attendance {
  id: string;
  event_id: string;
  nickname: string;
  email: string;
  status: Database["public"]["Enums"]["attendance_status_enum"];
  guest_token: string | null;
  created_at: string;
  updated_at: string;
}

// ====================================================================
// Payment関連の型定義
// ====================================================================

/**
 * 決済情報型
 */
export interface Payment {
  id: string;
  event_id: string;
  attendance_id: string;
  amount: number;
  method: Database["public"]["Enums"]["payment_method_enum"];
  status: Database["public"]["Enums"]["payment_status_enum"];
  stripe_payment_intent_id: string | null;
  webhook_event_id: string | null;
  webhook_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ====================================================================
// User関連の型定義
// ====================================================================

/**
 * ユーザー情報型
 */
export interface User {
  id: string;
  email: string;
  display_name: string;
  stripe_account_id: string | null;
  stripe_onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}
