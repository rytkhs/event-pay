import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { SupabaseClientFactory } from "./factory";

export async function createClient(): Promise<SupabaseClient<Database, "public">> {
  return await SupabaseClientFactory.createServerClient("server");
}
