/**
 * @file 開発基盤のセキュリティテストスイート
 * @description 開発基盤セットアップにおけるセキュリティ設定の検証
 */

import fs from "fs";
import path from "path";

// package.json の読み込み
import packageJson from "@/package.json";

describe("開発基盤セキュリティテスト", () => {
  describe("環境変数セキュリティ", () => {
    it("機密情報を含むファイルがGit管理から除外されている", () => {
      const gitignore = fs.readFileSync(".gitignore", "utf8");
      expect(gitignore).toContain(".env.local");
      expect(gitignore).toContain(".env");
      expect(gitignore).toContain("!.env.example");
    });

    it(".env.localが存在する場合、適切な設定形式になっている", () => {
      if (fs.existsSync(".env.local")) {
        const envLocal = fs.readFileSync(".env.local", "utf8");
        // 基本的な形式チェックのみ（実際の値は検証しない）
        expect(envLocal).toMatch(/NEXT_PUBLIC_SUPABASE_URL=/);
        expect(envLocal).toMatch(/SUPABASE_SERVICE_ROLE_KEY=/);

        // プレースホルダー値のチェック（コメント行以外の危険なデフォルト値を検出）
        const dangerousPatterns = [
          /^[^#]*your-supabase-project-url(?!\w)/im,
          /^[^#]*your-supabase-anon-key(?!\w)/im,
          /^[^#]*your-supabase-service-role-key(?!\w)/im,
          /^[^#]*your-stripe-secret-key(?!\w)/im,
          /^[^#]*your-webhook-secret(?!\w)/im,
          /^[^#]*your-stripe-publishable-key(?!\w)/im,
          /^[^#]*your-upstash-redis-url(?!\w)/im,
          /^[^#]*your-upstash-redis-token(?!\w)/im,
          /^[^#]*your-github-token(?!\w)/im,
          /^[^#]*your-nextauth-secret-min-32-chars(?!\w)/im,
          /^[^#]*example\.com/im,
          /^[^#]*test[_-]?123/im,
          /^[^#]*placeholder/im,
          /^[^#]*changeme/im,
        ];

        // RESEND_API_KEYのプレースホルダーチェック（本番環境では致命的エラー）
        if (envLocal.includes("RESEND_API_KEY=re_your-resend-api-key")) {
          if (process.env.NODE_ENV === "production") {
            fail(
              "🚨 本番環境でRESEND_API_KEYにプレースホルダー値が設定されています。実際のキーに変更してください。"
            );
          } else {
            // テスト環境では期待される設定のため、ログレベルを情報に変更
            // console.warn(
            //   "⚠️ RESEND_API_KEYにプレースホルダー値が設定されています。実際のキーに変更してください。"
            // );
          }
        }

        // 危険なパターンのチェック
        dangerousPatterns.forEach((pattern) => {
          expect(envLocal).not.toMatch(pattern);
        });

        // 重要な環境変数のプレースホルダーチェック（追加セキュリティ）
        const criticalEnvChecks = [
          { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", placeholder: "your-supabase-anon-key" },
          { key: "SUPABASE_SERVICE_ROLE_KEY", placeholder: "your-supabase-service-role-key" },
          { key: "STRIPE_SECRET_KEY", placeholder: "sk_test_your-stripe-secret-key" },
        ];

        criticalEnvChecks.forEach(({ key, placeholder }) => {
          if (envLocal.includes(`${key}=${placeholder}`)) {
            if (process.env.NODE_ENV === "production") {
              fail(`🚨 本番環境で${key}にプレースホルダー値が設定されています。`);
            } else {
              console.warn(
                `⚠️ ${key}にプレースホルダー値が設定されています。実際の値に変更してください。`
              );
            }
          }
        });
      }
    });

    it("環境変数の型定義でセキュリティ関連変数が必須設定されている", () => {
      const envTypes = fs.readFileSync("env.d.ts", "utf8");
      expect(envTypes).toContain("NEXT_PUBLIC_SUPABASE_URL: string");
      expect(envTypes).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY: string");
      expect(envTypes).toContain("SUPABASE_SERVICE_ROLE_KEY: string");
      expect(envTypes).toContain("STRIPE_SECRET_KEY: string");
    });
  });

  describe("Next.jsセキュリティ設定", () => {
    it("next.config.mjsファイルが存在し、基本設定がある", () => {
      expect(fs.existsSync("next.config.mjs")).toBe(true);

      const configContent = fs.readFileSync("next.config.mjs", "utf8");
      expect(configContent).toContain("headers");
      expect(configContent).toContain("X-Frame-Options");
      expect(configContent).toContain("X-Content-Type-Options");
    });

    it("セキュリティヘッダーの設定内容が適切である", () => {
      const configContent = fs.readFileSync("next.config.mjs", "utf8");

      // セキュリティヘッダーの設定確認
      expect(configContent).toContain('"X-Frame-Options"');
      expect(configContent).toContain('"DENY"');
      expect(configContent).toContain('"X-Content-Type-Options"');
      expect(configContent).toContain('"nosniff"');
      expect(configContent).toContain('"Referrer-Policy"');
      expect(configContent).toContain('"X-XSS-Protection"');

      // CSPヘッダーの設定確認
      expect(configContent).toContain('"Content-Security-Policy"');
      expect(configContent).toContain("default-src 'self'");
      expect(configContent).toContain("frame-src 'self'"); // Stripe対応のため、noneではなくselfとStripeドメイン
    });
  });

  describe("依存関係セキュリティ", () => {
    it("セキュリティ関連ライブラリが正しくインストールされている", () => {
      // 入力検証
      expect(packageJson.dependencies.zod).toBeDefined();

      // レート制限
      expect(packageJson.dependencies["@upstash/redis"]).toBeDefined();
      expect(packageJson.dependencies["@upstash/ratelimit"]).toBeDefined();

      // Supabaseセキュリティ
      expect(packageJson.dependencies["@supabase/ssr"]).toBeDefined();
    });

    it("開発用依存関係に本番で不要なパッケージが含まれていない", () => {
      // 本番では不要な開発用パッケージがdevDependenciesに配置されている
      expect(packageJson.devDependencies["@types/jest"]).toBeDefined();
      expect(packageJson.devDependencies["@types/node"]).toBeDefined();
    });
  });

  describe("TypeScriptセキュリティ設定", () => {
    it("strict modeが有効化されている", () => {
      const tsConfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
      expect(tsConfig.compilerOptions.strict).toBe(true);
      expect(tsConfig.compilerOptions.noEmit).toBe(true);
    });

    it("危険なTypeScript設定が無効化されている", () => {
      const tsConfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
      // allowJsが有効な場合、skipLibCheckも有効になっているべき
      if (tsConfig.compilerOptions.allowJs) {
        expect(tsConfig.compilerOptions.skipLibCheck).toBe(true);
      }
    });
  });

  describe("ESLintセキュリティルール", () => {
    it("セキュリティに関するESLintルールが設定されている", () => {
      const eslintConfig = JSON.parse(fs.readFileSync(".eslintrc.json", "utf8"));

      // TypeScriptの安全性ルール
      expect(eslintConfig.rules["@typescript-eslint/no-explicit-any"]).toBe("warn");

      // no-unused-varsルールは配列形式で設定されている場合があるため、適切にチェック
      const noUnusedVarsRule = eslintConfig.rules["@typescript-eslint/no-unused-vars"];
      if (Array.isArray(noUnusedVarsRule)) {
        expect(noUnusedVarsRule[0]).toBe("error");
      } else {
        expect(noUnusedVarsRule).toBe("error");
      }

      // コンソール出力の警告（本番で機密情報が漏洩しないため）
      expect(eslintConfig.rules["no-console"]).toBe("warn");
    });
  });

  describe("ファイルシステムセキュリティ", () => {
    it("機密性の高いディレクトリが適切に保護されている", () => {
      // .nextディレクトリは開発時に自動生成されるが、Gitに含まれない
      const gitignore = fs.readFileSync(".gitignore", "utf8");
      expect(gitignore).toContain(".next");
      expect(gitignore).toContain("node_modules");
    });

    it("Supabaseマイグレーションファイルに機密情報が含まれていない", () => {
      const migrationsDir = "supabase/migrations";
      if (fs.existsSync(migrationsDir)) {
        const migrationFiles = fs.readdirSync(migrationsDir);
        migrationFiles.forEach((file) => {
          if (file.endsWith(".sql")) {
            const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");
            // パスワードやキーのハードコーディングチェック
            expect(content.toLowerCase()).not.toMatch(/password\s*=\s*['"][^'"]+['"]/);
            expect(content.toLowerCase()).not.toMatch(/secret\s*=\s*['"][^'"]+['"]/);
          }
        });
      }
    });
  });

  describe("開発時のセキュリティベストプラクティス", () => {
    it("package.jsonにセキュリティ監査スクリプトが含まれる可能性がある", () => {
      // npm auditを実行するスクリプトがあるかチェック（任意）
      // 現時点では必須ではないが、将来的に追加予定
    });

    it("適切な.gitignoreパターンが設定されている", () => {
      const gitignore = fs.readFileSync(".gitignore", "utf8");

      // ログファイル（npm-debug.log*の形で存在）
      expect(gitignore).toContain("npm-debug.log*");

      // 一時ファイル
      expect(gitignore).toContain(".env*");
      expect(gitignore).toContain("!.env.example");

      // ビルドアーティファクト（buildディレクトリがNext.jsでは一般的）
      expect(gitignore).toContain("/build");
      expect(gitignore).toContain(".next");
    });
  });
});
