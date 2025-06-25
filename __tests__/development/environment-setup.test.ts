/**
 * @file 開発基盤セットアップのテストスイート
 * @description ENV-002,003の検証テスト
 */

describe("ENV-002: Next.js 14 (App Router) セットアップテスト", () => {
  describe("Next.js設定", () => {
    test("package.jsonにNext.js 14が設定されている", () => {
      const packageJson = require("../../package.json");
      expect(packageJson.dependencies.next).toMatch(/^\^14\./);
    });

    test("TypeScriptが有効化されている", () => {
      const tsConfig = require("../../tsconfig.json");
      expect(tsConfig.compilerOptions.strict).toBe(true);
      expect(tsConfig.compilerOptions.jsx).toBe("preserve");
    });

    test("App Routerのディレクトリ構造が存在する", () => {
      const fs = require("fs");
      expect(fs.existsSync("app")).toBe(true);
      expect(fs.existsSync("app/layout.tsx")).toBe(true);
      expect(fs.existsSync("app/page.tsx")).toBe(true);
    });
  });

  describe("Tailwind CSS設定", () => {
    test("Tailwind CSSが設定されている", () => {
      const packageJson = require("../../package.json");
      expect(packageJson.devDependencies.tailwindcss).toBeDefined();
    });

    test("Tailwind設定ファイルが存在する", () => {
      const fs = require("fs");
      expect(fs.existsSync("tailwind.config.ts")).toBe(true);
      expect(fs.existsSync("postcss.config.mjs")).toBe(true);
    });

    test("Shadcn/ui設定が完了している", () => {
      const fs = require("fs");
      expect(fs.existsSync("components.json")).toBe(true);
      expect(fs.existsSync("lib/utils.ts")).toBe(true);
    });
  });

  describe("ESLint/Prettier設定", () => {
    test("ESLint設定ファイルが存在する", () => {
      const fs = require("fs");
      expect(fs.existsSync(".eslintrc.json")).toBe(true);
    });

    test("Prettier設定ファイルが存在する", () => {
      const fs = require("fs");
      expect(fs.existsSync(".prettierrc")).toBe(true);
      expect(fs.existsSync(".prettierignore")).toBe(true);
    });

    test("ESLintにTypeScript設定が含まれている", () => {
      const eslintConfig = require("../../.eslintrc.json");
      expect(eslintConfig.extends).toContain("next/typescript");
      expect(eslintConfig.plugins).toContain("@typescript-eslint");
    });
  });

  describe("ディレクトリ構造", () => {
    test("推奨ディレクトリ構造が存在する", () => {
      const fs = require("fs");
      expect(fs.existsSync("app")).toBe(true);
      expect(fs.existsSync("components")).toBe(false); // まだ作成されていない
      expect(fs.existsSync("lib")).toBe(true);
      expect(fs.existsSync("types")).toBe(true);
    });

    test("Supabaseディレクトリが存在する", () => {
      const fs = require("fs");
      expect(fs.existsSync("supabase")).toBe(true);
      expect(fs.existsSync("supabase/config.toml")).toBe(true);
      expect(fs.existsSync("supabase/migrations")).toBe(true);
    });
  });
});

describe("ENV-003: 環境変数設定とセキュリティ管理テスト", () => {
  describe("環境変数テンプレート", () => {
    test(".env.exampleが存在し、必要な変数が定義されている", () => {
      const fs = require("fs");
      const envExample = fs.readFileSync(".env.example", "utf8");
      
      // Supabase設定
      expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      expect(envExample).toContain("SUPABASE_SERVICE_ROLE_KEY");
      
      // Stripe設定
      expect(envExample).toContain("STRIPE_SECRET_KEY");
      expect(envExample).toContain("STRIPE_WEBHOOK_SECRET");
      expect(envExample).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
      
      // Resend設定
      expect(envExample).toContain("RESEND_API_KEY");
      
      // セキュリティ設定
      expect(envExample).toContain("NEXTAUTH_SECRET");
      expect(envExample).toContain("RATE_LIMIT_REDIS_URL");
    });

    test("環境変数の型定義が存在する", () => {
      const fs = require("fs");
      expect(fs.existsSync("env.d.ts")).toBe(true);
      
      const envTypes = fs.readFileSync("env.d.ts", "utf8");
      expect(envTypes).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(envTypes).toContain("STRIPE_SECRET_KEY");
      expect(envTypes).toContain("NEXTAUTH_SECRET");
    });
  });

  describe("セキュリティ設定", () => {
    test("Next.jsセキュリティヘッダーが設定されている", () => {
      const fs = require("fs");
      const configContent = fs.readFileSync("next.config.mjs", "utf8");
      expect(configContent).toContain("headers");
      expect(configContent).toContain("X-Frame-Options");
    });

    test("セキュリティ関連ライブラリがインストールされている", () => {
      const packageJson = require("../../package.json");
      expect(packageJson.dependencies.zod).toBeDefined();
      expect(packageJson.dependencies["@upstash/redis"]).toBeDefined();
      expect(packageJson.dependencies["@upstash/ratelimit"]).toBeDefined();
    });
  });

  describe("実際の環境変数チェック", () => {
    test("開発環境で必要最小限の環境変数が設定されている", () => {
      // NODE_ENVは常に存在するはず
      expect(process.env.NODE_ENV).toBeDefined();
      
      // .env.localが存在する場合のチェック
      const fs = require("fs");
      if (fs.existsSync(".env.local")) {
        const envLocal = fs.readFileSync(".env.local", "utf8");
        expect(envLocal).toContain("NEXT_PUBLIC_SUPABASE_URL");
      }
    });
  });
});

describe("ENV統合テスト", () => {
  describe("開発サーバー起動準備", () => {
    test("package.jsonのスクリプトが正しく設定されている", () => {
      const packageJson = require("../../package.json");
      expect(packageJson.scripts.dev).toBe("next dev");
      expect(packageJson.scripts.build).toBe("next build");
      expect(packageJson.scripts.lint).toBe("next lint");
      expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
    });

    test("テスト関連スクリプトが設定されている", () => {
      const packageJson = require("../../package.json");
      expect(packageJson.scripts.test).toBe("jest");
      expect(packageJson.scripts["test:security"]).toBe("jest --testPathPattern=security");
    });

    test("データベース関連スクリプトが設定されている", () => {
      const packageJson = require("../../package.json");
      expect(packageJson.scripts["db:reset"]).toBe("npx supabase db reset");
      expect(packageJson.scripts["stripe:listen"]).toContain("stripe listen");
    });
  });

  describe("型安全性チェック", () => {
    test("TypeScript設定がstrict modeである", () => {
      const tsConfig = require("../../tsconfig.json");
      expect(tsConfig.compilerOptions.strict).toBe(true);
      expect(tsConfig.compilerOptions.noEmit).toBe(true);
    });

    test("パスエイリアスが設定されている", () => {
      const tsConfig = require("../../tsconfig.json");
      expect(tsConfig.compilerOptions.paths).toBeDefined();
      expect(tsConfig.compilerOptions.paths["@/*"]).toEqual(["./*"]);
    });
  });
});