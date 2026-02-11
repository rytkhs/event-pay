/**
 * Event ドメインの共有契約型
 * Layer 2 SoT: app/features から参照されるイベント関連型を集約
 */

import type { Database } from "@/types/database";

// ====================================================================
// Event関連のデータベース型エイリアス
// ====================================================================

/** eventsテーブルの行型（SELECT結果） */
export type EventRow = Database["public"]["Tables"]["events"]["Row"];

/** eventsテーブルの挿入型（INSERT用） */
export type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

/** eventsテーブルの更新型（UPDATE用） */
export type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

// ====================================================================
// Event関連のアプリケーション型定義
// ====================================================================

/**
 * イベント基本情報型
 * データベースのeventsテーブルに対応
 */
export interface EventBase {
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
export interface EventDetailProjection extends EventBase {
  creator_name: string; // 必須
  attendances_count: number; // 必須
}

// Phase 1互換エイリアス（利用側の段階移行用）
export type Event = EventBase;
export type EventDetail = EventDetailProjection;
