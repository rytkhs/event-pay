/**
 * @file 開発基盤のセキュリティテストスイート
 * @description 開発基盤セットアップにおけるセキュリティ設定の検証
 */

import fs from "fs";
import path from "path";

describe("開発基盤セキュリティテスト", () => {
  describe("環境変数セキュリティ", () => {
    test("機密情報を含むファイルがGit管理から除外されている", () => {
      const gitignore = fs.readFileSync(".gitignore", "utf8");
      expect(gitignore).toContain(".env.local");
      expect(gitignore).toContain(".env");
      expect(gitignore).toContain("!.env.example");
    });

    test(".env.localが存在する場合、適切な設定形式になっている", () => {
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
          /^[^#]*changeme/im
        ];
        
        // RESEND_API_KEYのプレースホルダーは開発環境では許可（実際のキーでない場合）
        if (envLocal.includes('RESEND_API_KEY=re_your-resend-api-key')) {
          console.warn('⚠️ RESEND_API_KEYにプレースホルダー値が設定されています。実際のキーに変更してください。');
        }
        
        dangerousPatterns.forEach(pattern => {
          expect(envLocal).not.toMatch(pattern);
        });
      }
    });

    test("環境変数の型定義でセキュリティ関連変数が必須設定されている", () => {
      const envTypes = fs.readFileSync("env.d.ts", "utf8");
      expect(envTypes).toContain("NEXTAUTH_SECRET: string");
      expect(envTypes).toContain("SUPABASE_SERVICE_ROLE_KEY: string");
      expect(envTypes).toContain("STRIPE_SECRET_KEY: string");
    });
  });

  describe("Next.jsセキュリティ設定", () => {
    test("next.config.mjsファイルが存在し、基本設定がある", () => {
      expect(fs.existsSync("next.config.mjs")).toBe(true);
      
      const configContent = fs.readFileSync("next.config.mjs", "utf8");
      expect(configContent).toContain("headers");
      expect(configContent).toContain("X-Frame-Options");
      expect(configContent).toContain("X-Content-Type-Options");
    });

    test("セキュリティヘッダーの設定内容が適切である", () => {
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
      expect(configContent).toContain("frame-src 'none'");
    });
  });

  describe("依存関係セキュリティ", () => {
    test("セキュリティ関連ライブラリが正しくインストールされている", () => {
      const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
      
      // 入力検証
      expect(packageJson.dependencies.zod).toBeDefined();
      
      // レート制限
      expect(packageJson.dependencies["@upstash/redis"]).toBeDefined();
      expect(packageJson.dependencies["@upstash/ratelimit"]).toBeDefined();
      
      // Supabaseセキュリティ
      expect(packageJson.dependencies["@supabase/ssr"]).toBeDefined();
    });

    test("開発用依存関係に本番で不要なパッケージが含まれていない", () => {
      const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
      
      // 本番では不要な開発用パッケージがdevDependenciesに配置されている
      expect(packageJson.devDependencies["@types/jest"]).toBeDefined();
      expect(packageJson.devDependencies["@types/node"]).toBeDefined();
      
      // これらが誤ってdependenciesに入っていないことを確認
      expect(packageJson.dependencies["@types/jest"]).toBeUndefined();
      expect(packageJson.dependencies["@types/node"]).toBeUndefined();
    });
  });

  describe("TypeScriptセキュリティ設定", () => {
    test("strict modeが有効化されている", () => {
      const tsConfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
      expect(tsConfig.compilerOptions.strict).toBe(true);
      expect(tsConfig.compilerOptions.noEmit).toBe(true);
    });

    test("危険なTypeScript設定が無効化されている", () => {
      const tsConfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
      // allowJsが有効な場合、skipLibCheckも有効になっているべき
      if (tsConfig.compilerOptions.allowJs) {
        expect(tsConfig.compilerOptions.skipLibCheck).toBe(true);
      }
    });
  });

  describe("ESLintセキュリティルール", () => {
    test("セキュリティに関するESLintルールが設定されている", () => {
      const eslintConfig = JSON.parse(fs.readFileSync(".eslintrc.json", "utf8"));
      
      // TypeScriptの安全性ルール
      expect(eslintConfig.rules["@typescript-eslint/no-explicit-any"]).toBe("warn");
      expect(eslintConfig.rules["@typescript-eslint/no-unused-vars"]).toBe("error");
      
      // コンソール出力の警告（本番で機密情報が漏洩しないため）
      expect(eslintConfig.rules["no-console"]).toBe("warn");
    });
  });

  describe("ファイルシステムセキュリティ", () => {
    test("機密性の高いディレクトリが適切に保護されている", () => {
      // .nextディレクトリは開発時に自動生成されるが、Gitに含まれない
      const gitignore = fs.readFileSync(".gitignore", "utf8");
      expect(gitignore).toContain(".next");
      expect(gitignore).toContain("node_modules");
    });

    test("Supabaseマイグレーションファイルに機密情報が含まれていない", () => {
      const migrationsDir = "supabase/migrations";
      if (fs.existsSync(migrationsDir)) {
        const migrationFiles = fs.readdirSync(migrationsDir);
        migrationFiles.forEach(file => {
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
    test("package.jsonにセキュリティ監査スクリプトが含まれる可能性がある", () => {
      const packageJson = require("../../package.json");
      // npm auditを実行するスクリプトがあるかチェック（任意）
      // 現時点では必須ではないが、将来的に追加予定
    });

    test("適切な.gitignoreパターンが設定されている", () => {
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