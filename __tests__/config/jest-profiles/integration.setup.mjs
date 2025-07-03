import { createMocks } from "../../helpers/mock-factory.mjs";
import "@testing-library/jest-dom";

// Integration test setup - complete mocks for end-to-end scenarios
beforeEach(() => {
  const mocks = createMocks({
    level: "integration",
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
      attendances: [
        { id: "attendance-1", event_id: "event-1", user_id: "user-1", status: "confirmed" },
      ],
    },
  });

  // Apply mocks globally
  global.mockSupabase = mocks.supabase;
  global.mockStripe = mocks.stripe;
  global.mockResend = mocks.resend;
  global.mockRateLimit = mocks.rateLimit;
  global.mockRedis = mocks.redis;
  global.mockRouter = mocks.router;
  global.mockSearchParams = mocks.searchParams;
  global.mockHeaders = mocks.headers;
  global.mockCookies = mocks.cookies;
});

afterEach(() => {
  jest.clearAllMocks();
});
