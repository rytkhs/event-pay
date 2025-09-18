import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/**
 * テストユーザー作成時のオプション
 */
interface CreateTestUserOptions {
  maxRetries?: number;
  retryDelay?: number;
  skipProfileCreation?: boolean;
}

/**
 * リトライ用のスリープ関数
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数バックオフでリトライする汎用関数
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  operationName: string = "operation"
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);

      // 最後の試行でない場合は待機
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying ${operationName} in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `${operationName} failed after ${maxRetries + 1} attempts: ${lastError?.message}`
  );
}

/**
 * テスト用ユーザーを作成または取得する（安定版）
 * 競合状態やエラーを考慮した堅牢な実装
 *
 * @param email ユーザーのメールアドレス
 * @param password ユーザーのパスワード
 * @param options 作成オプション
 * @returns 作成されたまたは既存のユーザー情報
 */
export async function createTestUser(
  email: string,
  password: string,
  options: CreateTestUserOptions = {}
): Promise<TestUser> {
  const { maxRetries = 3, retryDelay = 1000, skipProfileCreation = false } = options;

  return await withRetry(
    async () => {
      const secureFactory = SecureSupabaseClientFactory.getInstance();
      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        `Creating or updating test user for E2E tests: ${email}`,
        {
          operationType: "INSERT",
          accessedTables: ["auth.users", "auth.identities", "public.users"],
          additionalInfo: {
            testContext: "playwright-e2e-setup",
            userEmail: email,
            timestamp: new Date().toISOString(),
          },
        }
      );

      // Step 1: 既存ユーザーのチェックと取得
      const existingUser = await findExistingTestUser(adminClient, email);
      if (existingUser) {
        console.log(`✓ Using existing test user: ${email} (ID: ${existingUser.id})`);
        return await ensureUserProfileExists(
          adminClient,
          existingUser,
          email,
          password,
          skipProfileCreation
        );
      }

      // Step 2: 新規ユーザーの作成（排他制御付き）
      console.log(`Creating new test user: ${email}`);
      return await createNewTestUserSafely(adminClient, email, password, skipProfileCreation);
    },
    maxRetries,
    retryDelay,
    `createTestUser(${email})`
  );
}

/**
 * 既存のテストユーザーを検索する
 */
async function findExistingTestUser(adminClient: any, email: string): Promise<any | null> {
  try {
    const { data: users, error } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000, // 多めに設定して確実にキャッチ
    });

    if (error) {
      console.warn(`Warning: Failed to list users: ${error.message}`);
      return null;
    }

    return users.users.find((user: { email?: string }) => user.email === email) || null;
  } catch (error) {
    console.warn(`Warning: Exception while listing users:`, error);
    return null;
  }
}

/**
 * 既存ユーザーのプロファイルが存在することを確認し、必要に応じて作成
 */
async function ensureUserProfileExists(
  adminClient: any,
  existingUser: any,
  email: string,
  password: string,
  skipProfileCreation: boolean
): Promise<TestUser> {
  // ユーザーの確認状態を確認・修正
  if (!existingUser.email_confirmed_at) {
    await adminClient.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      user_metadata: {
        ...existingUser.user_metadata,
        test_user: true,
        created_by: "playwright-e2e-setup",
        updated_at: new Date().toISOString(),
      },
    });
    console.log(`✓ Updated test user confirmation status: ${email}`);
  }

  // プロファイル作成をスキップする場合
  if (skipProfileCreation) {
    return { id: existingUser.id, email, password };
  }

  // プロファイルの存在確認と作成
  const { data: existingProfile, error: profileError } = await adminClient
    .from("users")
    .select("id, name")
    .eq("id", existingUser.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    // PGRST116 (not found) 以外のエラーは警告
    console.warn(`Warning: Profile check failed for ${email}:`, profileError);
  }

  if (!existingProfile) {
    await adminClient.from("users").upsert(
      {
        id: existingUser.id,
        name: existingUser.user_metadata?.name || `テストユーザー_${email}`,
      },
      { onConflict: "id" }
    );
    console.log(`✓ Created profile for existing test user: ${email}`);
  }

  return { id: existingUser.id, email, password };
}

/**
 * 新規テストユーザーを安全に作成する（トランザクション風の処理）
 */
async function createNewTestUserSafely(
  adminClient: any,
  email: string,
  password: string,
  skipProfileCreation: boolean
): Promise<TestUser> {
  let createdUserId: string | null = null;

  try {
    // Step 1: auth.usersにユーザーを作成
    const { data, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        test_user: true,
        created_by: "playwright-e2e-setup",
        created_at: new Date().toISOString(),
      },
    });

    if (authError) {
      // 既に存在するユーザーかもしれない（並行処理での競合）
      if (
        authError.message?.includes("already been registered") ||
        authError.message?.includes("email address is already")
      ) {
        console.log(`User may have been created by another process: ${email}`);
        const existingUser = await findExistingTestUser(adminClient, email);
        if (existingUser) {
          return await ensureUserProfileExists(
            adminClient,
            existingUser,
            email,
            password,
            skipProfileCreation
          );
        }
      }
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    if (!data.user) {
      throw new Error("User creation succeeded but user data is missing");
    }

    createdUserId = data.user.id;
    console.log(`✓ Auth user created: ${email} (ID: ${createdUserId})`);

    // Step 2: public.usersにプロファイルを作成（スキップでない場合）
    if (!skipProfileCreation && createdUserId) {
      const { error: profileError } = await adminClient.from("users").upsert(
        {
          id: createdUserId,
          name: data.user.user_metadata?.name || `テストユーザー_${email}`,
        },
        { onConflict: "id", ignoreDuplicates: false }
      );

      if (profileError) {
        throw new Error(`Failed to create user profile: ${profileError.message}`);
      }
      console.log(`✓ Profile created: ${email}`);
    }

    if (!createdUserId) {
      throw new Error("User ID is missing after creation");
    }

    console.log(`✓ Test user created successfully: ${email}`);
    return { id: createdUserId, email, password };
  } catch (error) {
    // ロールバック処理
    if (createdUserId) {
      console.log(`⚠ Rolling back user creation: ${email} (ID: ${createdUserId})`);
      try {
        await adminClient.auth.admin.deleteUser(createdUserId);
        console.log(`✓ Rollback completed for: ${email}`);
      } catch (rollbackError) {
        console.error(`✗ Rollback failed for ${email}:`, rollbackError);
      }
    }
    throw error;
  }
}

/**
 * 既存のテストユーザーを削除する（安定版）
 *
 * @param email 削除するユーザーのメールアドレス
 * @param options 削除オプション
 */
export async function deleteTestUser(
  email: string,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<void> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  return await withRetry(
    async () => {
      const secureFactory = SecureSupabaseClientFactory.getInstance();
      const adminClient = await secureFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_CLEANUP,
        `Deleting test user after E2E tests: ${email}`,
        {
          operationType: "DELETE",
          accessedTables: ["auth.users", "auth.identities", "public.users"],
          additionalInfo: {
            testContext: "playwright-e2e-cleanup",
            userEmail: email,
            timestamp: new Date().toISOString(),
          },
        }
      );

      // ユーザーを検索
      const testUser = await findExistingTestUser(adminClient, email);

      if (!testUser) {
        console.log(`Test user not found (may have been already deleted): ${email}`);
        return;
      }

      console.log(`Deleting test user: ${email} (ID: ${testUser.id})`);

      // Step 1: public.usersからプロファイルを削除（存在する場合）
      try {
        const { error: profileDeleteError } = await adminClient
          .from("users")
          .delete()
          .eq("id", testUser.id);

        if (profileDeleteError && profileDeleteError.code !== "PGRST116") {
          console.warn(`Warning: Failed to delete user profile for ${email}:`, profileDeleteError);
        } else if (!profileDeleteError) {
          console.log(`✓ Profile deleted for test user: ${email}`);
        }
      } catch (error) {
        console.warn(`Warning: Exception while deleting profile for ${email}:`, error);
      }

      // Step 2: auth.usersからユーザーを削除
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(testUser.id);

      if (deleteError) {
        throw new Error(`Failed to delete auth user: ${deleteError.message}`);
      }

      console.log(`✓ Test user deleted successfully: ${email}`);
    },
    maxRetries,
    retryDelay,
    `deleteTestUser(${email})`
  );
}

/**
 * 複数のテストユーザーを一度に作成する（安定版）
 *
 * @param users 作成するユーザー情報の配列
 * @param options 作成オプション
 * @returns 作成されたユーザー情報の配列
 */
export async function createMultipleTestUsers(
  users: Array<{ email: string; password: string }>,
  options: CreateTestUserOptions & { parallel?: boolean; cleanupOnFailure?: boolean } = {}
): Promise<TestUser[]> {
  const { parallel = false, cleanupOnFailure = true, ...createOptions } = options;

  if (parallel) {
    // 並列実行（高速だが、リソース使用量が多い）
    return await createMultipleTestUsersParallel(users, createOptions, cleanupOnFailure);
  } else {
    // 順次実行（安全）
    return await createMultipleTestUsersSequentially(users, createOptions, cleanupOnFailure);
  }
}

/**
 * テストユーザーを順次作成する
 */
async function createMultipleTestUsersSequentially(
  users: Array<{ email: string; password: string }>,
  options: CreateTestUserOptions,
  cleanupOnFailure: boolean
): Promise<TestUser[]> {
  const createdUsers: TestUser[] = [];

  for (const [index, userInfo] of users.entries()) {
    try {
      console.log(`Creating test user ${index + 1}/${users.length}: ${userInfo.email}`);
      const testUser = await createTestUser(userInfo.email, userInfo.password, options);
      createdUsers.push(testUser);
    } catch (error) {
      console.error(`Failed to create test user ${userInfo.email}:`, error);

      if (cleanupOnFailure) {
        console.log(`Cleaning up ${createdUsers.length} already created users...`);
        await cleanupTestUsers(createdUsers);
      }
      throw new Error(`Failed to create test user ${userInfo.email}: ${error}`);
    }
  }

  console.log(`✓ Successfully created ${createdUsers.length} test users`);
  return createdUsers;
}

/**
 * テストユーザーを並列作成する
 */
async function createMultipleTestUsersParallel(
  users: Array<{ email: string; password: string }>,
  options: CreateTestUserOptions,
  cleanupOnFailure: boolean
): Promise<TestUser[]> {
  console.log(`Creating ${users.length} test users in parallel...`);

  const results = await Promise.allSettled(
    users.map((userInfo) => createTestUser(userInfo.email, userInfo.password, options))
  );

  const createdUsers: TestUser[] = [];
  const failedUsers: string[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      createdUsers.push(result.value);
    } else {
      const email = users[index].email;
      failedUsers.push(email);
      console.error(`Failed to create test user ${email}:`, result.reason);
    }
  }

  if (failedUsers.length > 0) {
    console.error(`Failed to create ${failedUsers.length} users: ${failedUsers.join(", ")}`);

    if (cleanupOnFailure && createdUsers.length > 0) {
      console.log(`Cleaning up ${createdUsers.length} successfully created users...`);
      await cleanupTestUsers(createdUsers);
    }

    throw new Error(`Failed to create ${failedUsers.length} test users: ${failedUsers.join(", ")}`);
  }

  console.log(`✓ Successfully created ${createdUsers.length} test users in parallel`);
  return createdUsers;
}

/**
 * テストユーザーのクリーンアップを実行する
 */
async function cleanupTestUsers(users: TestUser[]): Promise<void> {
  const cleanupPromises = users.map(async (user) => {
    try {
      await deleteTestUser(user.email);
    } catch (cleanupError) {
      console.error(`Failed to cleanup user ${user.email}:`, cleanupError);
    }
  });

  await Promise.allSettled(cleanupPromises);
  console.log(`Cleanup completed for ${users.length} users`);
}

/**
 * すべてのテストユーザーを削除する（危険な操作）
 */
export async function deleteAllTestUsers(): Promise<void> {
  console.warn("⚠ Deleting ALL test users - this is a destructive operation");

  const secureFactory = SecureSupabaseClientFactory.getInstance();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    "Deleting all test users (cleanup operation)",
    {
      operationType: "DELETE",
      accessedTables: ["auth.users", "auth.identities", "public.users"],
      additionalInfo: {
        testContext: "playwright-e2e-bulk-cleanup",
        timestamp: new Date().toISOString(),
      },
    }
  );

  // テストユーザーを検索
  const { data: users, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(`Failed to list users: ${error.message}`);
  }

  const testUsers = users.users.filter((user: any) => user.user_metadata?.test_user === true);

  if (testUsers.length === 0) {
    console.log("No test users found to delete");
    return;
  }

  console.log(`Found ${testUsers.length} test users to delete`);

  for (const user of testUsers) {
    try {
      if (user.email) {
        await deleteTestUser(user.email);
      } else {
        console.warn(`Skipping user without email: ${user.id}`);
      }
    } catch (error) {
      console.error(`Failed to delete test user ${user.email}:`, error);
    }
  }

  console.log(`✓ Completed deletion of ${testUsers.length} test users`);
}
