declare namespace NodeJS {
  interface ProcessEnv {
    // Supabase Configuration
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY: string;

    // Stripe Configuration
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string;

    // Resend API Configuration
    RESEND_API_KEY: string;

    // Application Configuration
    NEXT_PUBLIC_APP_URL: string;
    NEXTAUTH_SECRET: string;
    NEXTAUTH_URL: string;

    // Security Configuration
    RATE_LIMIT_REDIS_URL?: string;
    RATE_LIMIT_REDIS_TOKEN?: string;

    // MCP Configuration (Optional)
    GITHUB_PERSONAL_ACCESS_TOKEN?: string;
    POSTGRES_CONNECTION_STRING?: string;

    // Node Environment
    NODE_ENV: "development" | "production" | "test";
  }
}