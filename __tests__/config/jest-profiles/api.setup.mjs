import { createMocks } from "../../helpers/mock-factory.mjs";

// Set Supabase environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "SUPABASE_ANON_KEY_REDACTED";
process.env.SUPABASE_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY_REDACTED";

// API test setup - enhanced mocks for API testing
beforeEach(() => {
  const mocks = createMocks({
    level: "api",
    features: {
      auth: true,
      database: true,
      storage: false,
      stripe: true,
      email: true,
      rateLimit: false,
    },
    data: {
      users: [{ id: "user-1", email: "test@example.com", name: "Test User" }],
    },
  });

  // Apply mocks globally
  global.mockSupabase = mocks.supabase;
  global.mockStripe = mocks.stripe;
  global.mockResend = mocks.resend;
  global.mockHeaders = mocks.headers;
  global.mockCookies = mocks.cookies;
});

afterEach(() => {
  jest.clearAllMocks();
});
