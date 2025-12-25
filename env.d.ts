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
    /** Stripe Webhook署名検証用シークレット（whsec_xxx） - プライマリ */
    STRIPE_WEBHOOK_SECRET: string;
    /** Stripe Webhook署名検証用シークレット（whsec_xxx） - セカンダリ（ローテーション用・オプション） */
    STRIPE_WEBHOOK_SECRET_SECONDARY?: string;
    /** Stripe Webhook署名検証用シークレット（whsec_xxx） - テスト環境プライマリ */
    STRIPE_WEBHOOK_SECRET_TEST?: string;
    /** Stripe Webhook署名検証用シークレット（whsec_xxx） - テスト環境セカンダリ（オプション） */
    STRIPE_WEBHOOK_SECRET_TEST_SECONDARY?: string;
    /** Stripe Connect Webhook署名検証用シークレット（whsec_xxx） - プライマリ */
    STRIPE_CONNECT_WEBHOOK_SECRET?: string;
    /** Stripe Connect Webhook署名検証用シークレット（whsec_xxx） - セカンダリ（ローテーション用・オプション） */
    STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY?: string;
    /** Stripe Connect Webhook署名検証用シークレット（whsec_xxx） - テスト環境プライマリ */
    STRIPE_CONNECT_WEBHOOK_SECRET_TEST?: string;
    /** Stripe Connect Webhook署名検証用シークレット（whsec_xxx） - テスト環境セカンダリ（オプション） */
    STRIPE_CONNECT_WEBHOOK_SECRET_TEST_SECONDARY?: string;
    /** Stripe パブリッシャブルキー（フロントエンド用、pk_test_xxx または pk_live_xxx） */
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;
    /** Stripe API バージョン（例: 2024-06-20）。未設定時はSDKデフォルトを使用 */
    STRIPE_API_VERSION?: string;
    /** Stripe Webhook タイムスタンプ許容秒数（デフォルト: 300）。例: 300 */
    STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE?: string;

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
    UPSTASH_REDIS_REST_URL?: string;
    /**
     * Upstash Redis トークン（レート制限用）
     * - UPSTASH_REDIS_REST_URLと合わせて設定が必要
     * - 未設定時はレート制限が無効化される（開発環境のみ）
     */
    UPSTASH_REDIS_REST_TOKEN?: string;

    // ===========================
    // Node.js Environment
    // ===========================
    /** Node.js実行環境 */
    NODE_ENV: "development" | "production" | "test";

    // ===========================
    // App URLs / Origins
    // ===========================
    /** アプリのベースURL（例: https://eventpay.app） */
    NEXT_PUBLIC_APP_URL?: string;
    /** 追加許可オリジン（カンマ区切り） */
    ALLOWED_ORIGINS?: string;

    // ===========================
    // Google Analytics 4 Configuration（オプショナル）
    // ===========================
    /** GA4 Measurement ID（G-で始まる識別子、例: G-XXXXXXXXXX） */
    NEXT_PUBLIC_GA_MEASUREMENT_ID?: string;
    /** GA4 Measurement Protocol API Secret（サーバー側イベント送信用） */
    GA_API_SECRET?: string;

    // ===========================
    // App Mode / Flag Configuration
    // ===========================
    /** デモモード有効化フラグ */
    NEXT_PUBLIC_IS_DEMO?: string;
    /** 本番環境の公開URL */
    NEXT_PUBLIC_PRODUCTION_URL?: string;

    // ===========================
    // Maintenance Configuration
    // ===========================
    /** メンテナンスモード有効化フラグ */
    MAINTENANCE_MODE?: string;
    /** メンテナンスモード回避用トークン */
    MAINTENANCE_BYPASS_TOKEN?: string;

    // ===========================
    // Email Configuration
    // ===========================
    /** 送信元メールアドレス（必須） */
    FROM_EMAIL: string;
    /** 管理者メールアドレス */
    ADMIN_EMAIL?: string;

    // ===========================
    // Security Secrets
    // ===========================
    /** レート制限/HMAC用シークレット（必須） */
    RL_HMAC_SECRET: string;
    /** Cronジョブ認証用シークレット */
    CRON_SECRET?: string;

    // ===========================
    // QStash Configuration (Job Queue)
    // ===========================
    QSTASH_URL?: string;
    QSTASH_TOKEN?: string;
    QSTASH_CURRENT_SIGNING_KEY?: string;
    QSTASH_NEXT_SIGNING_KEY?: string;

    // ===========================
    // LINE Login Configuration
    // ===========================
    NEXT_PUBLIC_LINE_CHANNEL_ID?: string;
    LINE_CHANNEL_SECRET?: string;

    // ===========================
    // Other Integrations
    // ===========================
    /** Slack通知用Webhook URL */
    SLACK_CONTACT_WEBHOOK_URL?: string;

    // ===========================
    // Demo Environment
    // ===========================
    DEMO_STRIPE_ACCOUNT_ID?: string;

    // ===========================
    // Testing & Development
    // ===========================
    /** テスト時のQStashスキップ（同期実行）設定 */
    SKIP_QSTASH_IN_TEST?: string;
    /** プラットフォーム残高の監視閾値 (JPY) */
    PLATFORM_BALANCE_MIN_JPY?: string;

    // ===========================
    // Security - Webhook IP Control (Optional)
    // ===========================
    /**
     * Webhook IP制御の有効/無効
     * - ENABLE_STRIPE_IP_CHECK: true/false
     * 本番時の既定は有効。
     */
    ENABLE_STRIPE_IP_CHECK?: string;
  }
}
