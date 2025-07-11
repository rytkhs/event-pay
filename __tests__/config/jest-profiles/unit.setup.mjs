import { createMocks } from "../../helpers/mock-factory.mjs";
import "@testing-library/jest-dom";

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
};

// Unit test setup - minimal mocks only
beforeEach(() => {
  const mocks = createMocks({
    level: "unit",
    features: {
      auth: false,
      database: false,
      storage: false,
      stripe: false,
      email: false,
      rateLimit: false,
    },
  });

  // Apply mocks globally
  global.mockSupabase = mocks.supabase;
  global.mockHeaders = mocks.headers;
  global.mockCookies = mocks.cookies;
});

afterEach(() => {
  jest.clearAllMocks();
});
