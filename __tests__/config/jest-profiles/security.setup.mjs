import { createMocks } from "../../helpers/mock-factory.mjs";

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
