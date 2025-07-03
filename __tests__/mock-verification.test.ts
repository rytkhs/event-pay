/**
 * Mock Verification Test
 * Testing the new stateful Supabase mock factory
 */

import { createClient } from "@supabase/supabase-js";

describe("新しいSupabaseモックファクトリーの検証", () => {
  let client: any;

  beforeEach(() => {
    client = createClient("https://test.supabase.co", "test-key");
    client._reset();
  });

  test("基本的なinsert/select操作", async () => {
    console.log("=== Testing basic insert/select ===");

    // Insert data
    const insertResult = await client
      .from("users")
      .insert({
        id: "test-user-1",
        name: "テストユーザー",
        email: "test@example.com",
      })
      .select()
      .single();

    console.log("Insert result:", insertResult);
    expect(insertResult.error).toBeNull();
    expect(insertResult.data).toBeTruthy();
    expect(insertResult.data.name).toBe("テストユーザー");

    // Debug: Check database state after insert
    const dbStateAfterInsert = client._getDB();
    console.log("Database state after insert:", dbStateAfterInsert);

    // Set authentication context to allow select access
    client._setAuth({
      id: "test-user-1",
      email: "test@example.com",
    });

    // Select data
    const selectResult = await client.from("users").select("*").eq("id", "test-user-1").single();

    console.log("Select result:", selectResult);
    expect(selectResult.error).toBeNull();
    expect(selectResult.data).toBeTruthy();
    expect(selectResult.data.name).toBe("テストユーザー");
  });

  test("RLS認証コンテキストのテスト", async () => {
    console.log("=== Testing RLS authentication context ===");

    // Insert user data
    await client.from("users").insert({
      id: "test-user-2",
      name: "認証テストユーザー",
      email: "auth-test@example.com",
    });

    // Set authentication context
    client._setAuth({
      id: "test-user-2",
      email: "auth-test@example.com",
    });

    // Select with authentication
    const authSelectResult = await client
      .from("users")
      .select("*")
      .eq("id", "test-user-2")
      .single();

    console.log("Authenticated select result:", authSelectResult);
    expect(authSelectResult.error).toBeNull();
    expect(authSelectResult.data).toBeTruthy();
    expect(authSelectResult.data.name).toBe("認証テストユーザー");
  });

  test("Update操作のテスト", async () => {
    console.log("=== Testing update operations ===");

    // Insert initial data
    await client.from("users").insert({
      id: "test-user-3",
      name: "更新前ユーザー",
      email: "update-test@example.com",
    });

    // Set authentication
    client._setAuth({
      id: "test-user-3",
      email: "update-test@example.com",
    });

    // Update data
    const updateResult = await client
      .from("users")
      .update({ name: "更新後ユーザー" })
      .eq("id", "test-user-3")
      .select()
      .single();

    console.log("Update result:", updateResult);
    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toBeTruthy();
    expect(updateResult.data.name).toBe("更新後ユーザー");
  });

  test("データベース状態の確認", async () => {
    console.log("=== Testing database state inspection ===");

    // Insert test data
    await client.from("users").insert([
      { id: "user-1", name: "ユーザー1", email: "user1@test.com" },
      { id: "user-2", name: "ユーザー2", email: "user2@test.com" },
    ]);

    // Check database state
    const dbState = client._getDB();
    console.log("Database state:", dbState);

    expect(dbState.users).toHaveLength(2);
    expect(dbState.users[0].name).toBe("ユーザー1");
    expect(dbState.users[1].name).toBe("ユーザー2");
  });
});
