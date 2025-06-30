import { jest } from "@jest/globals";
import { render, RenderOptions } from "@testing-library/react";
import { ReactElement } from "react";

// Mock data generators
export const mockUser = {
  id: "test-user-id",
  email: "test@example.com",
  user_metadata: {
    full_name: "Test User",
  },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

export const mockEvent = {
  id: "test-event-id",
  title: "Test Event",
  description: "A test event for testing purposes",
  date: "2024-12-31T23:59:59Z",
  location: "Test Location",
  price: 1000,
  capacity: 100,
  organizer_id: "test-user-id",
  status: "draft" as const,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

export const mockAttendance = {
  id: "test-attendance-id",
  event_id: "test-event-id",
  user_id: "test-user-id",
  status: "attending" as const,
  payment_status: "pending" as const,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

// Test data factory functions
export const createMockUser = (overrides: Partial<typeof mockUser> = {}) => ({
  ...mockUser,
  ...overrides,
});

export const createMockEvent = (overrides: Partial<typeof mockEvent> = {}) => ({
  ...mockEvent,
  ...overrides,
});

export const createMockAttendance = (overrides: Partial<typeof mockAttendance> = {}) => ({
  ...mockAttendance,
  ...overrides,
});

// Custom render function for components that need providers
interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  // Add any provider props here if needed
}

export const customRender = (ui: ReactElement, options?: CustomRenderOptions) => {
  return render(ui, {
    ...options,
    // Add wrapper here if needed for providers like ThemeProvider, etc.
  });
};

// Helper to create mock API responses
export const createMockSupabaseResponse = <T>(data: T | null = null, error: any = null) => ({
  data,
  error,
});

// Helper to create mock Stripe responses
export const createMockStripeResponse = <T>(data: T) => ({
  id: "mock_" + Math.random().toString(36).substring(7),
  object: "mock",
  ...data,
});

// Helper to wait for async operations in tests
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock environment variables for testing
export const mockEnvVars = {
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  STRIPE_SECRET_KEY: "sk_test_mock",
  STRIPE_PUBLIC_KEY: "pk_test_mock",
  STRIPE_WEBHOOK_SECRET: "whsec_mock",
  RESEND_API_KEY: "resend_mock",
  UPSTASH_REDIS_REST_URL: "https://mock-redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "mock-token",
};

// Helper to mock Next.js environment
export const mockNextJsEnvironment = () => {
  Object.entries(mockEnvVars).forEach(([key, value]) => {
    process.env[key] = value;
  });
};

// Helper to clean up mocks after tests
export const cleanupMocks = () => {
  jest.clearAllMocks();

  // Reset environment variables
  Object.keys(mockEnvVars).forEach((key) => {
    delete process.env[key];
  });
};

// Re-export commonly used testing utilities
export * from "@testing-library/react";
