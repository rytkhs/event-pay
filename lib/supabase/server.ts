import { SupabaseClientFactory } from "./factory";

export function createSupabaseServerClient() {
  return SupabaseClientFactory.createServerClient("server");
}

// createClient エイリアスを追加
export const createClient = createSupabaseServerClient;
