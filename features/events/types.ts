export interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  fee: number;
  capacity: number;
  status: "upcoming" | "ongoing" | "past" | "canceled";
  creator_name: string;
  // 実際のSupabaseクエリから取得される参加者数
  attendances_count?: number;
  // 作成日時（ソート用）
  created_at: string;
}
