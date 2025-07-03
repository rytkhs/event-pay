/**
 * Simple test to validate Supabase SSR implementation
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

describe("Simple Supabase SSR Test", () => {
  test("Server client can be created", () => {
    expect(() => {
      const client = createSupabaseServerClient();
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
    }).not.toThrow();
  });

  test("Browser client can be created", () => {
    expect(() => {
      const client = createSupabaseBrowserClient();
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
    }).not.toThrow();
  });
});
