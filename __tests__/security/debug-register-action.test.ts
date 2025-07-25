/**
 * registerActionの詳細デバッグテスト
 * 問題の原因を特定するため
 */

import { registerAction } from "@/app/(auth)/actions";

describe("registerAction デバッグテスト", () => {
  // テスト用のFormDataを作成
  const createFormData = (overrides: Record<string, string> = {}) => {
    const formData = new FormData();
    const data = {
      name: "Valid Name",
      email: "test@example.com",
      password: "Test123456",
      passwordConfirm: "Test123456",
      termsAgreed: "true",
      ...overrides,
    };

    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    return formData;
  };

  test("詳細デバッグ: 危険な入力 'test; rm -rf /'", async () => {
    console.log("=== 詳細デバッグ開始 ===");

    const formData = createFormData({ name: "test; rm -rf /" });

    // FormDataの中身を確認
    console.log("FormData contents:");
    for (const [key, value] of formData.entries()) {
      console.log(`  ${key}: "${value}"`);
    }

    console.log("registerAction実行前...");
    const result = await registerAction(formData);
    console.log("registerAction実行後");

    console.log("Result:", JSON.stringify(result, null, 2));

    // 詳細な検証
    console.log(`Success: ${result.success}`);
    console.log(`Error: ${result.error}`);
    console.log(`FieldErrors:`, result.fieldErrors);
    console.log(`Message: ${result.message}`);
    console.log(`NeedsVerification: ${result.needsVerification}`);
    console.log(`RedirectUrl: ${result.redirectUrl}`);

    // テストの期待値
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.name).toContain("名前に無効な文字が含まれています");
    }
  });

  test("詳細デバッグ: 空白文字 ' '", async () => {
    console.log("=== 空白文字デバッグ ===");

    const formData = createFormData({ name: " " });
    const result = await registerAction(formData);

    console.log("Result:", JSON.stringify(result, null, 2));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.name).toContain("名前を入力してください");
    }
  });

  test("詳細デバッグ: 正常な入力 '田中太郎'", async () => {
    console.log("=== 正常入力デバッグ ===");

    const formData = createFormData({ name: "田中太郎" });
    const result = await registerAction(formData);

    console.log("Result:", JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
  });

  // NODE_ENV の確認
  test("環境変数確認", () => {
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log(
      "SUPABASE_SERVICE_ROLE_KEY:",
      process.env.SUPABASE_SERVICE_ROLE_KEY ? "設定あり" : "設定なし"
    );
  });
});
