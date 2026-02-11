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
  registration_deadline: string;
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
