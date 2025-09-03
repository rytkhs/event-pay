import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { SupabaseClientFactory } from "./factory";

export function createClient(): SupabaseClient<Database> {
  return SupabaseClientFactory.createServerClient("server");
}
