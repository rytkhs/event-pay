/**
 * 実際の registerAction に対する検証バイパステスト
 * 実際のServer Actionを使用して検証を行う
 */

// registerAction を直接インポート
import { registerAction } from "@/app/(auth)/actions";

describe("実際の registerAction バリデーション バイパステスト", () => {
  // 有効なベースデータ
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

  describe("空白文字のバイパス検証", () => {
    test("単一空白文字でのバイパステスト", async () => {
      const formData = createFormData({ name: " " });

      const result = await registerAction(formData);

      // 単一空白文字はトリムされて空文字になるため、「名前を入力してください」エラー
      expect(result.success).toBe(false);

      if (!result.success && result.fieldErrors?.name) {
        expect(result.fieldErrors.name).toContain("名前を入力してください");
      }
    });

    test("複数空白文字でのバイパステスト", async () => {
      const formData = createFormData({ name: "   " });

      const result = await registerAction(formData);

      // 複数空白文字もトリムされて空文字になるため拒否される
      expect(result.success).toBe(false);

      if (!result.success && result.fieldErrors?.name) {
        expect(result.fieldErrors.name).toContain("名前を入力してください");
      }
    });

    test("タブ文字でのバイパステスト", async () => {
      const formData = createFormData({ name: "\t" });

      const result = await registerAction(formData);

      // タブ文字もトリムされて空文字になるため拒否される
      expect(result.success).toBe(false);

      if (!result.success && result.fieldErrors?.name) {
        expect(result.fieldErrors.name).toContain("名前を入力してください");
      }
    });
  });

  describe("危険な入力値の検証", () => {
    const dangerousInputs = [
      "test; rm -rf /",
      "test$(whoami)",
      "test{rm}",
      "test<script>",
      "test`id`",
      "test|whoami",
      "test&&rm",
      "test(id)",
      "test[rm]",
      "test\\whoami",
      "test&id",
      "test>file",
    ];

    dangerousInputs.forEach((dangerousInput) => {
      test(`"${dangerousInput}" は実際のactionでも拒否されるべき`, async () => {
        const formData = createFormData({ name: dangerousInput });

        const result = await registerAction(formData);

        // 危険な入力は拒否されるべき
        expect(result.success).toBe(false);

        if (!result.success && result.fieldErrors?.name) {
          expect(result.fieldErrors.name).toContain("名前に無効な文字が含まれています");
        }
      });
    });
  });

  describe("前後空白を含む危険な入力の検証", () => {
    const edgeDangerousInputs = [" test; ", "  test$  ", "\ttest`\t", "\ntest|\n", " test& "];

    edgeDangerousInputs.forEach((input) => {
      test(`"${input}" は前後空白があっても拒否されるべき`, async () => {
        const formData = createFormData({ name: input });

        const result = await registerAction(formData);

        // 前後に空白があっても危険文字を含む場合は拒否されるべき
        expect(result.success).toBe(false);

        if (!result.success && result.fieldErrors?.name) {
          expect(result.fieldErrors.name).toContain("名前に無効な文字が含まれています");
        }
      });
    });
  });

  describe("有効な入力の確認", () => {
    const validInputs = ["田中太郎", "John Doe", "山田-花子", "test_user", "user123"];

    validInputs.forEach((validInput) => {
      test(`"${validInput}" は許可されるべき`, async () => {
        const formData = createFormData({ name: validInput });

        const result = await registerAction(formData);

        // 有効な入力は成功するはず
        expect(result.success).toBe(true);
        // needsVerificationは実装により異なるため、undefinedでも許可
        if (result.needsVerification !== undefined) {
          expect(result.needsVerification).toBe(true);
        }
      });
    });
  });
});
