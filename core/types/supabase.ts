import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

/**
 * Layer 2で公開するSupabase型
 * feature層はこのファイル経由でDB型境界を参照する
 */
export type AppDatabase = Database;
export type AppJson = Json;
export type AppSupabaseClient<SchemaName extends keyof AppDatabase = "public"> = SupabaseClient<
  AppDatabase,
  SchemaName
>;
