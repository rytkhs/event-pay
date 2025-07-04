// Jest DOM matchers for Testing Library
import "@testing-library/jest-dom";

// Jest Axe for accessibility testing
import { toHaveNoViolations } from 'jest-axe';

// Jest専用型定義を読み込み
import "./types/test.d.ts";

// Load environment variables for testing
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Extend Jest matchers with accessibility testing
expect.extend(toHaveNoViolations);

// Global test utilities (preserved from original setup)
global.testUtils = {
  // Mock user for authenticated tests
  mockUser: {
    id: "test-user-id",
    email: "test@example.com",
    user_metadata: {
      full_name: "Test User",
    },
  },

  // Mock event data
  mockEvent: {
    id: "test-event-id",
    title: "Test Event",
    description: "A test event",
    date: "2024-12-31T23:59:59Z",
    location: "Test Location",
    price: 1000,
    capacity: 100,
    organizer_id: "test-user-id",
  },

  // Helper to reset all mocks
  resetAllMocks: () => {
    if (typeof jest !== "undefined") {
      jest.clearAllMocks();
    }
  },
};

// Mock Supabase connection test function (preserved)
global.testSupabaseConnection =
  typeof jest !== "undefined" ? jest.fn().mockResolvedValue(true) : () => Promise.resolve(true);

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Setup before each test
beforeEach(() => {
  // Clear all mocks before each test
  if (typeof jest !== "undefined") {
    jest.clearAllMocks();
  }
});

// Cleanup after tests
afterAll(() => {
  // Final cleanup
  if (typeof jest !== "undefined") {
    jest.restoreAllMocks();
  }
});

// Silence console warnings in tests (optional)
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  if (typeof jest !== "undefined") {
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});
