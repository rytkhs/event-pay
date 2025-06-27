declare namespace NodeJS {
  interface ProcessEnv {
    // ===========================
    // Supabase Configuration（必須）
    // ===========================
    /** Supabase プロジェクトURL（例: https://xxx.supabase.co） */
    NEXT_PUBLIC_SUPABASE_URL: string;
    /** Supabase 匿名キー（フロントエンド用） */
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    /** Supabase サービスロールキー（サーバーサイド用、RLSバイパス権限） */
    SUPABASE_SERVICE_ROLE_KEY: string;

    // ===========================
    // Stripe Configuration（必須）
    // ===========================
    /** Stripe シークレットキー（sk_test_xxx または sk_live_xxx） */
    STRIPE_SECRET_KEY: string;
    /** Stripe Webhook署名検証用シークレット（whsec_xxx） */
    STRIPE_WEBHOOK_SECRET: string;
    /** Stripe パブリッシャブルキー（フロントエンド用、pk_test_xxx または pk_live_xxx） */
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;

    // ===========================
    // Resend API Configuration（必須）
    // ===========================
    /** Resend APIキー（re_xxx）- トランザクションメール送信用 */
    RESEND_API_KEY: string;

    // ===========================
    // Security Configuration（レート制限）
    // ===========================
    /**
     * Upstash Redis URL（レート制限用）
     * - 開発環境: オプショナル（未設定時はモックレート制限を使用）
     * - 本番環境: 必須（セキュリティ確保のため）
     */
    RATE_LIMIT_REDIS_URL?: string;
    /**
     * Upstash Redis トークン（レート制限用）
     * - RATE_LIMIT_REDIS_URLと合わせて設定が必要
     * - 未設定時はレート制限が無効化される（開発環境のみ）
     */
    RATE_LIMIT_REDIS_TOKEN?: string;

    // ===========================
    // MCP Configuration（開発支援用、オプショナル）
    // ===========================
    /**
     * GitHub Personal Access Token
     * - Claude Code + GitHub MCPサーバー使用時に必要
     * - Issue管理、PR作成、コードレビュー支援に使用
     * - 権限: repo, issues, pull_requests
     */
    GITHUB_PERSONAL_ACCESS_TOKEN?: string;
    /**
     * PostgreSQL接続文字列（MCP用）
     * - Claude Code + Postgres MCPサーバー使用時に必要
     * - データベース直接操作、クエリ最適化に使用
     * - 例: postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
     */
    POSTGRES_CONNECTION_STRING?: string;

    // ===========================
    // Node.js Environment
    // ===========================
    /** Node.js実行環境 */
    NODE_ENV: "development" | "production" | "test";
  }
}
