/**
 * 重要なセキュリティ検証バイパス調査
 * registerSchema の name フィールドの危険な入力値に対する検証をテスト
 */

import { z } from "zod";

// registerSchema を app/(auth)/actions.ts から直接コピー
// 実際のスキーマ定義（2025年1月時点の最新版）
const registerSchema = z
  .object({
    name: z
      .string()
      .transform((str) => str.trim()) // 最初にトリム
      .refine((trimmed) => trimmed.length >= 1, {
        message: "名前を入力してください",
      })
      .refine((trimmed) => trimmed.length <= 100, {
        message: "名前は100文字以内で入力してください",
      })
      .refine(
        (trimmed) => {
          // NULL文字やcontrol文字のチェック
          if (trimmed.includes("\0") || trimmed.includes("\x1a")) return false;
          // 危険な特殊文字のチェック（アポストロフィと引用符は許可）
          if (/[;&|`$(){}[\]<>\\]/.test(trimmed)) return false;
          // コマンドインジェクション対策（完全なコマンド形式のみ拒否）
          if (
            /^\s*(rm|cat|echo|whoami|id|ls|pwd|sudo|su|curl|wget|nc|nmap|chmod|chown|kill|ps|top|netstat|find|grep|awk|sed|tail|head|sort|uniq)\s+/.test(
              trimmed
            )
          )
            return false;
          return true;
        },
        {
          message: "名前に無効な文字が含まれています",
        }
      ),
    email: z.string().email("有効なメールアドレスを入力してください").max(254),
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(128)
      .regex(
        /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/,
        "パスワードは大文字・小文字・数字を含む必要があります"
      ),
    passwordConfirm: z.string(),
    termsAgreed: z.string().refine((value) => value === "true", {
      message: "利用規約に同意してください",
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

describe("registerSchema バリデーション バイパス調査", () => {
  // 有効なベースデータ
  const validBaseData = {
    email: "test@example.com",
    password: "Test123456",
    passwordConfirm: "Test123456",
    termsAgreed: "true",
  };

  // 検証すべき危険な入力値
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

  describe("危険な特殊文字の検証", () => {
    dangerousInputs.forEach((dangerousInput) => {
      test(`"${dangerousInput}" は拒否されるべき`, () => {
        console.log(`\n=== テスト入力値: "${dangerousInput}" ===`);

        const testData = {
          ...validBaseData,
          name: dangerousInput,
        };

        const result = registerSchema.safeParse(testData);

        console.log("検証結果:", {
          success: result.success,
          input: dangerousInput,
          trimmed: dangerousInput.trim(),
          regexTest: /[;&|`$(){}[\]<>\\]/.test(dangerousInput.trim()),
        });

        if (!result.success) {
          console.log("エラー詳細:", result.error.flatten());
        } else {
          console.log("⚠️  危険: 検証を通過しました!");
        }

        // この入力は拒否されるべき
        expect(result.success).toBe(false);

        if (!result.success) {
          const nameErrors = result.error.flatten().fieldErrors.name;
          expect(nameErrors).toBeDefined();
          expect(nameErrors).toContain("名前に無効な文字が含まれています");
        }
      });
    });
  });

  describe("正規表現の個別テスト", () => {
    test("危険文字の正規表現パターンを個別テスト", () => {
      const dangerousCharRegex = /[;&|`$(){}[\]<>\\]/;

      console.log("\n=== 正規表現パターンの個別テスト ===");

      dangerousInputs.forEach((input) => {
        const trimmed = input.trim();
        const matches = dangerousCharRegex.test(trimmed);

        console.log(`入力: "${input}"`);
        console.log(`  トリム後: "${trimmed}"`);
        console.log(`  正規表現マッチ: ${matches}`);
        console.log(
          `  文字コード分析:`,
          trimmed.split("").map((char) => ({
            char,
            code: char.charCodeAt(0),
            unicode: char.codePointAt(0)?.toString(16),
          }))
        );
        console.log("---");

        expect(matches).toBe(true);
      });
    });
  });

  describe("refine 関数の直接テスト", () => {
    test("refine 関数を直接実行して検証ロジックをテスト", () => {
      console.log("\n=== refine 関数の直接テスト ===");

      // refine 関数のロジックを抽出
      const validateName = (name: string) => {
        const trimmed = name.trim();

        console.log(`検証開始: "${name}"`);
        console.log(`トリム後: "${trimmed}"`);

        // NULL文字やcontrol文字のチェック
        if (trimmed.includes("\0") || trimmed.includes("\x1a")) {
          console.log("NULL/control文字で拒否");
          return false;
        }

        // 危険な特殊文字のチェック
        const dangerousCharTest = /[;&|`$(){}[\]<>\\]/.test(trimmed);
        console.log(`危険文字テスト結果: ${dangerousCharTest}`);
        if (dangerousCharTest) {
          console.log("危険文字で拒否");
          return false;
        }

        // コマンドインジェクション対策
        const commandTest =
          /^\s*(rm|cat|echo|whoami|id|ls|pwd|sudo|su|curl|wget|nc|nmap|chmod|chown|kill|ps|top|netstat|find|grep|awk|sed|tail|head|sort|uniq)\s+/.test(
            trimmed
          );
        console.log(`コマンドテスト結果: ${commandTest}`);
        if (commandTest) {
          console.log("コマンドパターンで拒否");
          return false;
        }

        console.log("検証通過");
        return true;
      };

      dangerousInputs.forEach((input) => {
        console.log(`\n--- 直接テスト: "${input}" ---`);
        const result = validateName(input);
        console.log(`結果: ${result}`);

        // 危険な入力は false を返すべき
        expect(result).toBe(false);
      });
    });
  });

  describe("有効な入力値の確認", () => {
    const validInputs = [
      "田中太郎",
      "John Doe",
      "山田-花子",
      "test_user",
      "user123",
      "O'Connor", // アポストロフィは許可されるべき
      'Smith "Jr"', // 引用符は許可されるべき
    ];

    validInputs.forEach((validInput) => {
      test(`"${validInput}" は許可されるべき`, () => {
        const testData = {
          ...validBaseData,
          name: validInput,
        };

        const result = registerSchema.safeParse(testData);

        console.log(`有効入力テスト: "${validInput}"`);
        console.log("結果:", result.success);

        if (!result.success) {
          console.log("予期しないエラー:", result.error.flatten());
        }

        expect(result.success).toBe(true);
      });
    });
  });

  describe("エッジケースの検証", () => {
    test("空文字列と空白文字のテスト", () => {
      const edgeCases = ["", " ", "  ", "\t", "\n", " test; ", " test$ "];

      edgeCases.forEach((input) => {
        console.log(`\nエッジケーステスト: "${input}"`);
        console.log(`入力長: ${input.length}, トリム後長: ${input.trim().length}`);
        console.log(
          `文字コード: [${input
            .split("")
            .map((c) => c.charCodeAt(0))
            .join(", ")}]`
        );

        const testData = {
          ...validBaseData,
          name: input,
        };

        const result = registerSchema.safeParse(testData);
        console.log(`結果: ${result.success}`);

        if (!result.success) {
          console.log("エラー:", result.error.flatten().fieldErrors.name);
        } else {
          console.log("⚠️  予期しない成功");
        }

        // 空文字列や危険文字を含むものは拒否されるべき
        if (input.trim() === "" || /[;&|`$(){}[\]<>\\]/.test(input.trim())) {
          expect(result.success).toBe(false);
        }
      });
    });

    test("具体的な空白文字の個別テスト", () => {
      // 単一空白文字のテスト
      console.log("\n=== 単一空白文字の詳細分析 ===");

      const singleSpace = " ";
      console.log(`入力: "${singleSpace}"`);
      console.log(`入力長: ${singleSpace.length}`);
      console.log(`トリム後: "${singleSpace.trim()}"`);
      console.log(`トリム後長: ${singleSpace.trim().length}`);
      console.log(`トリム後 === "": ${singleSpace.trim() === ""}`);

      // refine 関数のロジックをステップバイステップでテスト
      const name = singleSpace;
      const trimmed = name.trim();

      console.log("\n--- transform+refine ロジックのステップテスト ---");
      console.log(`1. transform: "${name}" -> "${trimmed}"`);

      // 長さチェック（refine 1）
      const lengthCheck = trimmed.length >= 1;
      console.log(`2. 長さチェック: ${trimmed.length} >= 1? ${lengthCheck}`);

      // 最大長チェック（refine 2）
      const maxLengthCheck = trimmed.length <= 100;
      console.log(`3. 最大長チェック: ${trimmed.length} <= 100? ${maxLengthCheck}`);

      // NULL文字チェック（refine 3）
      const hasNull = trimmed.includes("\0") || trimmed.includes("\x1a");
      console.log(`4. NULL文字チェック: ${hasNull}`);

      // 危険文字チェック（refine 3）
      const hasDangerous = /[;&|`$(){}[\]<>\\]/.test(trimmed);
      console.log(`5. 危険文字チェック: ${hasDangerous}`);

      // コマンドチェック（refine 3）
      const hasCommand =
        /^\s*(rm|cat|echo|whoami|id|ls|pwd|sudo|su|curl|wget|nc|nmap|chmod|chown|kill|ps|top|netstat|find|grep|awk|sed|tail|head|sort|uniq)\s+/.test(
          trimmed
        );
      console.log(`6. コマンドチェック: ${hasCommand}`);

      console.log(
        `最終判定: 通過すべきか? ${lengthCheck && maxLengthCheck && !hasNull && !hasDangerous && !hasCommand}`
      );

      // 実際の検証
      const testData = {
        ...validBaseData,
        name: singleSpace,
      };

      const result = registerSchema.safeParse(testData);
      console.log(`実際の結果: ${result.success}`);

      if (!result.success) {
        console.log("エラー詳細:", result.error.flatten());
      }
    });
  });
});
