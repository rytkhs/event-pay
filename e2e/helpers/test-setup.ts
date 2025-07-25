import { AccountLockoutService } from "@/lib/auth-security";

/**
 * E2Eテスト用セットアップヘルパー
 */

/**
 * 全テストユーザーのアカウントロック状態をクリア
 */
export async function clearAllTestUserLockouts(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    console.warn("clearAllTestUserLockouts should only be called in test environment");
    return;
  }

  const testUsers = ["test@eventpay.test", "creator@eventpay.test", "participant@eventpay.test"];

  try {
    await Promise.all(testUsers.map((email) => AccountLockoutService.clearFailedAttempts(email)));
  } catch (error) {
    console.warn("Failed to clear test user lockouts:", error);
  }
}

/**
 * 特定のユーザーのアカウントロック状態をクリア
 */
export async function clearUserLockout(email: string): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    console.warn("clearUserLockout should only be called in test environment");
    return;
  }

  try {
    await AccountLockoutService.clearFailedAttempts(email);
  } catch (error) {
    console.warn(`Failed to clear lockout for ${email}:`, error);
  }
}

/**
 * テスト実行前の環境準備
 */
export async function setupTestEnvironment(): Promise<void> {
  await clearAllTestUserLockouts();
}

/**
 * テスト実行後のクリーンアップ
 */
export async function cleanupTestEnvironment(): Promise<void> {
  // 必要に応じて追加のクリーンアップ処理
  await clearAllTestUserLockouts();
}
