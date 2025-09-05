import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/**
 * テスト用ユーザーを作成または取得する
 * Admin APIを使用して即座にログイン可能なユーザーを作成、既に存在する場合はそれを使用
 *
 * @param email ユーザーのメールアドレス
 * @param password ユーザーのパスワード
 * @returns 作成されたまたは既存のユーザー情報
 */
export async function createTestUser(email: string, password: string): Promise<TestUser> {
  // セキュアファクトリーインスタンスを取得
  const secureFactory = SecureSupabaseClientFactory.getInstance();

  // 監査付き管理者クライアントを作成
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating or updating test user for E2E tests: ${email}`,
    {
      operationType: "INSERT",
      accessedTables: ["auth.users", "auth.identities"],
      additionalInfo: {
        testContext: "playwright-e2e-setup",
        userEmail: email,
      },
    }
  );

  // まず既存ユーザーを確認
  const { data: existingUsers } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  const existingUser = existingUsers.users.find((user: { email?: string }) => user.email === email);

  if (existingUser) {
    console.log(`Test user already exists: ${email} (ID: ${existingUser.id})`);

    // ユーザーが確認済みでない場合は更新
    if (!existingUser.email_confirmed_at) {
      await adminClient.auth.admin.updateUserById(existingUser.id, {
        email_confirm: true,
        user_metadata: {
          test_user: true,
          created_by: "playwright-e2e-setup",
          updated_at: new Date().toISOString(),
        },
      });
      console.log(`Updated existing test user to confirmed: ${email}`);
    }

    // public.usersにプロファイルが存在するか確認
    const { data: existingProfile, error: profileError } = await adminClient
      .from("users")
      .select("id")
      .eq("id", existingUser.id)
      .single();

    // プロファイルが存在しない場合は作成
    if (profileError || !existingProfile) {
      const { error: createProfileError } = await adminClient.from("users").insert({
        id: existingUser.id,
        name: existingUser.user_metadata?.name || `テストユーザー_${email}`,
      });

      if (createProfileError) {
        console.error("Failed to create profile for existing user:", createProfileError);
        // プロファイル作成エラーは警告のみ（非致命的）
      } else {
        console.log(`Created profile for existing test user: ${email}`);
      }
    }

    return {
      id: existingUser.id,
      email,
      password,
    };
  }

  // 新規ユーザーを作成
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // メール確認をスキップして即ログイン可能に
    user_metadata: {
      test_user: true,
      created_by: "playwright-e2e-setup",
      created_at: new Date().toISOString(),
    },
  });

  if (error) {
    console.error("Failed to create test user:", error);
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  if (!data.user) {
    throw new Error("User creation succeeded but user data is missing");
  }

  console.log(`Test user created successfully: ${email} (ID: ${data.user.id})`);

  // public.usersテーブルにプロファイルを作成
  const { error: profileError } = await adminClient.from("users").insert({
    id: data.user.id,
    name: data.user.user_metadata?.name || `テストユーザー_${email}`,
  });

  if (profileError) {
    console.error("Failed to create profile for new user:", profileError);
    // プロファイル作成に失敗した場合、作成したauth.usersも削除してロールバック
    try {
      await adminClient.auth.admin.deleteUser(data.user.id);
      console.log("Rolled back auth.users creation due to profile creation failure");
    } catch (rollbackError) {
      console.error("Failed to rollback user creation:", rollbackError);
    }
    throw new Error(`Failed to create user profile: ${profileError.message}`);
  }

  console.log(`Profile created for new test user: ${email}`);

  return {
    id: data.user.id,
    email,
    password,
  };
}

/**
 * 既存のテストユーザーを削除する
 *
 * @param email 削除するユーザーのメールアドレス
 */
export async function deleteTestUser(email: string): Promise<void> {
  const secureFactory = SecureSupabaseClientFactory.getInstance();

  // 監査付き管理者クライアントを作成
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    `Deleting test user after E2E tests: ${email}`,
    {
      operationType: "DELETE",
      accessedTables: ["auth.users", "auth.identities"],
      additionalInfo: {
        testContext: "playwright-e2e-cleanup",
        userEmail: email,
      },
    }
  );

  // ユーザーを検索
  const { data: users, error: listError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (listError) {
    console.error("Failed to list users:", listError);
    return;
  }

  const testUser = users.users.find((user: { email?: string }) => user.email === email);

  if (!testUser) {
    console.log(`Test user not found: ${email}`);
    return;
  }

  // 先にpublic.usersからプロファイルを削除
  const { error: profileDeleteError } = await adminClient
    .from("users")
    .delete()
    .eq("id", testUser.id);

  if (profileDeleteError) {
    console.error("Failed to delete user profile:", profileDeleteError);
    // プロファイル削除エラーは警告のみ（非致命的）
  } else {
    console.log(`Profile deleted for test user: ${email}`);
  }

  // auth.usersからユーザーを削除
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(testUser.id);

  if (deleteError) {
    console.error("Failed to delete test user:", deleteError);
    throw new Error(`Failed to delete test user: ${deleteError.message}`);
  }

  console.log(`Test user deleted successfully: ${email}`);
}

/**
 * 複数のテストユーザーを一度に作成する
 *
 * @param users 作成するユーザー情報の配列
 * @returns 作成されたユーザー情報の配列
 */
export async function createMultipleTestUsers(
  users: Array<{ email: string; password: string }>
): Promise<TestUser[]> {
  const createdUsers: TestUser[] = [];

  for (const userInfo of users) {
    try {
      const testUser = await createTestUser(userInfo.email, userInfo.password);
      createdUsers.push(testUser);
    } catch (error) {
      console.error(`Failed to create test user ${userInfo.email}:`, error);
      // 既に作成されたユーザーをクリーンアップ
      for (const createdUser of createdUsers) {
        try {
          await deleteTestUser(createdUser.email);
        } catch (cleanupError) {
          console.error(`Failed to cleanup user ${createdUser.email}:`, cleanupError);
        }
      }
      throw error;
    }
  }

  return createdUsers;
}
