import { jest } from "@jest/globals";
import "@testing-library/jest-dom";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
      SUPABASE_SERVICE_ROLE_KEY: string;
    }
  }

  var testUtils: {
    mockUser: {
      id: string;
      email: string;
      user_metadata: {
        full_name: string;
      };
    };
    mockEvent: {
      id: string;
      title: string;
      description: string;
      date: string;
      location: string;
      price: number;
      capacity: number;
      organizer_id: string;
    };
    resetAllMocks: () => void;
  };

  var mockSupabase: {
    auth: {
      getUser: jest.MockedFunction<any>;
      verifyOtp: jest.MockedFunction<any>;
      resend: jest.MockedFunction<any>;
    };
    from: jest.MockedFunction<any>;
  };

  var mockStripe: any;
  var mockResend: any;
  var mockRateLimit: any;
  var mockRedis: any;
  var mockHeaders: any;
  var mockCookies: any;

  var testSupabaseConnection: jest.MockedFunction<() => Promise<boolean>>;

  // Fetch API mock
  var fetch: jest.MockedFunction<typeof fetch>;

  namespace jest {
    interface Matchers<R> {
      toMatchObject(expected: Record<string, any>): R;
    }
  }
}

export {};
