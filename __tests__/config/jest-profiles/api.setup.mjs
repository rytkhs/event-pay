import { createMocks } from "../../helpers/mock-factory.mjs";

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
