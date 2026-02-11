import type { Event } from "@core/types/models";

/**
 * イベント一覧表示用の軽量型
 * core/types/models.ts の Event から必要なフィールドのみを抽出し、
 * 一覧表示に特化した型に変換して使用する。
 */
export type EventListItem = Pick<
  Event,
  "id" | "title" | "date" | "fee" | "capacity" | "status" | "created_at"
> & {
  /** 表示用場所 */
  location: string | null;
  /** 参加者数（attending のみカウント） */
  attendances_count?: number;
};
