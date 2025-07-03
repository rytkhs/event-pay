import { mockHeaders, mockCookies, mockRouter, mockSearchParams } from "../mocks/base/next.mjs";
import { createMinimalSupabaseMock } from "../mocks/base/supabase-minimal.mjs";
import {
  mockStripe,
  mockResend,
  mockUpstashRateLimit,
  mockUpstashRedis,
} from "../mocks/base/external-services.mjs";

class MockFactory {
  static instance = null;
  mocks = new Map();

  static getInstance() {
    if (!MockFactory.instance) {
      MockFactory.instance = new MockFactory();
    }
    return MockFactory.instance;
  }

  createMocks(options) {
    const { level, features = {}, data = {} } = options;

    this.reset();

    switch (level) {
      case "minimal":
        return this.createMinimalMocks();
      case "unit":
        return this.createUnitMocks(features);
      case "api":
        return this.createApiMocks(features, data);
      case "security":
        return this.createSecurityMocks(features, data);
      case "integration":
        return this.createIntegrationMocks(features, data);
      default:
        throw new Error(`Unknown mock level: ${level}`);
    }
  }

  createMinimalMocks() {
    const mocks = {
      supabase: createMinimalSupabaseMock(),
      headers: mockHeaders(),
      cookies: mockCookies(),
    };

    this.mocks.set("current", mocks);
    return mocks;
  }

  createUnitMocks(features = {}) {
    const mocks = this.createMinimalMocks();

    if (features.stripe) {
      mocks.stripe = mockStripe();
    }

    if (features.email) {
      mocks.resend = mockResend();
    }

    if (features.rateLimit) {
      mocks.rateLimit = mockUpstashRateLimit();
      mocks.redis = mockUpstashRedis();
    }

    this.mocks.set("current", mocks);
    return mocks;
  }

  createApiMocks(features = {}, data = {}) {
    const mocks = this.createUnitMocks(features);

    // Enhanced Supabase mock for API testing
    if (features.database || features.auth) {
      mocks.supabase = this.createEnhancedSupabaseMock(data);
    }

    this.mocks.set("current", mocks);
    return mocks;
  }

  createSecurityMocks(features = {}, data = {}) {
    const mocks = this.createApiMocks(features, data);

    // Add security-specific mocks
    mocks.rateLimit = mockUpstashRateLimit();
    mocks.redis = mockUpstashRedis();

    // Enhanced auth handling
    if (features.auth) {
      mocks.supabase.auth = this.createSecurityAuthMock();
    }

    this.mocks.set("current", mocks);
    return mocks;
  }

  createIntegrationMocks(features = {}, data = {}) {
    const mocks = this.createSecurityMocks(features, data);

    // Full integration mocks
    mocks.stripe = mockStripe();
    mocks.resend = mockResend();
    mocks.router = mockRouter();
    mocks.searchParams = mockSearchParams();

    this.mocks.set("current", mocks);
    return mocks;
  }

  createEnhancedSupabaseMock(data = {}) {
    const baseMock = createMinimalSupabaseMock();
    const mockData = new Map();

    // Initialize test data
    if (data.users) mockData.set("users", data.users);
    if (data.events) mockData.set("events", data.events);
    if (data.attendances) mockData.set("attendances", data.attendances);
    if (data.payments) mockData.set("payments", data.payments);

    // Enhanced query builder with data simulation
    const createEnhancedQueryBuilder = (table) => {
      const baseBuilder = baseMock.from(table);

      // Override the then method to return actual test data
      baseBuilder.then = jest.fn((resolve) => {
        const tableData = mockData.get(table) || [];
        return resolve({ data: tableData, error: null });
      });

      // Override select to return data immediately for testing
      baseBuilder.select = jest.fn(() => {
        const tableData = mockData.get(table) || [];
        return Promise.resolve({ data: tableData, error: null });
      });

      return baseBuilder;
    };

    return {
      ...baseMock,
      from: jest.fn(createEnhancedQueryBuilder),
      // Enhanced auth mock with actual user data
      auth: {
        ...baseMock.auth,
        getUser: jest.fn(() =>
          Promise.resolve({
            data: { user: { id: "test-user-id", email: "test@example.com" } },
            error: null,
          })
        ),
      },
    };
  }

  createSecurityAuthMock() {
    return {
      getUser: jest.fn(() =>
        Promise.resolve({
          data: { user: { id: "test-user-id", email: "test@example.com" } },
          error: null,
        })
      ),
      getSession: jest.fn(() =>
        Promise.resolve({
          data: { session: { user: { id: "test-user-id" } } },
          error: null,
        })
      ),
      signUp: jest.fn(() => Promise.resolve({ data: null, error: null })),
      signInWithPassword: jest.fn(() => Promise.resolve({ data: null, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      resetPasswordForEmail: jest.fn(() => Promise.resolve({ data: null, error: null })),
      updateUser: jest.fn(() => Promise.resolve({ data: null, error: null })),
      setSession: jest.fn(() => Promise.resolve({ data: null, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    };
  }

  getMocks() {
    return this.mocks.get("current") || {};
  }

  reset() {
    this.mocks.clear();
    jest.clearAllMocks();
  }
}

// Convenience functions
const createMocks = (options) => {
  return MockFactory.getInstance().createMocks(options);
};

const getMocks = () => {
  return MockFactory.getInstance().getMocks();
};

const resetMocks = () => {
  MockFactory.getInstance().reset();
};

export { MockFactory, createMocks, getMocks, resetMocks };
