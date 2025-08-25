// Jest DOM matchers for Testing Library
import "@testing-library/jest-dom";

// Jest専用型定義を読み込み
import "./types/test.d.ts";

// Load environment variables for testing
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Global test utilities
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
    created_by: "test-user-id",
  },

  // Helper to reset all mocks
  resetAllMocks: () => {
    if (typeof jest !== "undefined") {
      jest.clearAllMocks();
    }
  },
};

// Mock Supabase connection test function
global.testSupabaseConnection =
  typeof jest !== "undefined" ? jest.fn().mockResolvedValue(true) : () => Promise.resolve(true);

// Essential JSDOM polyfills for modern web APIs
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// HTMLFormElement.prototype.requestSubmit polyfill for JSDOM
Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
  value: function (submitter) {
    const event = new Event("submit", { bubbles: true, cancelable: true });
    if (submitter) {
      Object.defineProperty(event, "submitter", {
        value: submitter,
        writable: false,
        configurable: true,
      });
    }
    this.dispatchEvent(event);
  },
  writable: true,
  configurable: true,
});

// Comprehensive JSDOM polyfills for Radix UI pointer capture
const addPointerCaptureMethods = (target) => {
  if (!target.hasPointerCapture) {
    Object.defineProperty(target, "hasPointerCapture", {
      value: () => false,
      writable: true,
      configurable: true,
    });
  }
  if (!target.setPointerCapture) {
    Object.defineProperty(target, "setPointerCapture", {
      value: () => {},
      writable: true,
      configurable: true,
    });
  }
  if (!target.releasePointerCapture) {
    Object.defineProperty(target, "releasePointerCapture", {
      value: () => {},
      writable: true,
      configurable: true,
    });
  }
};

// Apply to core prototypes
[Element.prototype, HTMLElement.prototype, EventTarget.prototype].forEach(addPointerCaptureMethods);

// Global error suppression for specific JSDOM issues
const originalError = console.error;
console.error = (...args) => {
  const message = args[0];
  if (
    typeof message === "string" &&
    (message.includes("hasPointerCapture") ||
      message.includes("setPointerCapture") ||
      message.includes("releasePointerCapture"))
  ) {
    return; // Suppress pointer capture errors
  }
  originalError.apply(console, args);
};

// Mock modern web APIs for Radix UI components
global.PointerEvent =
  global.PointerEvent ||
  function (type, init) {
    return new Event(type, init);
  };

global.IntersectionObserver =
  global.IntersectionObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

global.ResizeObserver =
  global.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

// Setup and cleanup
beforeEach(() => {
  if (typeof jest !== "undefined") {
    jest.clearAllMocks();
  }
});

afterAll(() => {
  if (typeof jest !== "undefined") {
    jest.restoreAllMocks();
  }
});
