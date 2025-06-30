import { createMocks } from "../../helpers/mock-factory.mjs";

// Set Supabase environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "SUPABASE_ANON_KEY_REDACTED";
process.env.SUPABASE_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY_REDACTED";

// Security test setup - full security mocks
beforeEach(() => {
  const mocks = createMocks({
    level: "security",
    features: {
      auth: true,
      database: true,
      storage: true,
      stripe: true,
      email: true,
      rateLimit: true,
    },
    data: {
      users: [
        { id: "user-1", email: "test@example.com", name: "Test User" },
        { id: "user-2", email: "test2@example.com", name: "Test User 2" },
      ],
      events: [{ id: "event-1", title: "Test Event", creator_id: "user-1" }],
    },
  });

  // Apply mocks globally
  global.mockSupabase = mocks.supabase;
  global.mockStripe = mocks.stripe;
  global.mockResend = mocks.resend;
  global.mockRateLimit = mocks.rateLimit;
  global.mockRedis = mocks.redis;
  global.mockHeaders = mocks.headers;
  global.mockCookies = mocks.cookies;
});

afterEach(() => {
  jest.clearAllMocks();
});
