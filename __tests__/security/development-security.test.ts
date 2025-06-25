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
        // プレースホルダー値のままでないことを確認（セキュリティ上詳細は検証しない）
        expect(envLocal).not.toContain("your-supabase-url");
        expect(envLocal).not.toContain("your-supabase-service-role-key");
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
      const fs = require("fs");
      expect(fs.existsSync("next.config.mjs")).toBe(true);
      
      const configContent = fs.readFileSync("next.config.mjs", "utf8");
      expect(configContent).toContain("headers");
      expect(configContent).toContain("X-Frame-Options");
      expect(configContent).toContain("X-Content-Type-Options");
    });

    test("セキュリティヘッダーの設定内容が適切である", () => {
      const fs = require("fs");
      const configContent = fs.readFileSync("next.config.mjs", "utf8");
      
      // セキュリティヘッダーの設定確認
      expect(configContent).toContain('"X-Frame-Options"');
      expect(configContent).toContain('"DENY"');
      expect(configContent).toContain('"X-Content-Type-Options"');
      expect(configContent).toContain('"nosniff"');
      expect(configContent).toContain('"Referrer-Policy"');
      expect(configContent).toContain('"X-XSS-Protection"');
    });
  });

  describe("依存関係セキュリティ", () => {
    test("セキュリティ関連ライブラリが正しくインストールされている", () => {
      const packageJson = require("../../package.json");
      
      // 入力検証
      expect(packageJson.dependencies.zod).toBeDefined();
      
      // レート制限
      expect(packageJson.dependencies["@upstash/redis"]).toBeDefined();
      expect(packageJson.dependencies["@upstash/ratelimit"]).toBeDefined();
      
      // Supabaseセキュリティ
      expect(packageJson.dependencies["@supabase/ssr"]).toBeDefined();
    });

    test("開発用依存関係に本番で不要なパッケージが含まれていない", () => {
      const packageJson = require("../../package.json");
      
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
      const tsConfig = require("../../tsconfig.json");
      expect(tsConfig.compilerOptions.strict).toBe(true);
      expect(tsConfig.compilerOptions.noEmit).toBe(true);
    });

    test("危険なTypeScript設定が無効化されている", () => {
      const tsConfig = require("../../tsconfig.json");
      // allowJsが有効な場合、skipLibCheckも有効になっているべき
      if (tsConfig.compilerOptions.allowJs) {
        expect(tsConfig.compilerOptions.skipLibCheck).toBe(true);
      }
    });
  });

  describe("ESLintセキュリティルール", () => {
    test("セキュリティに関するESLintルールが設定されている", () => {
      const eslintConfig = require("../../.eslintrc.json");
      
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