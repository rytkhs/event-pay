import { jest } from "@jest/globals";
import "@testing-library/jest-dom";

/**
 * Jest専用のグローバル型定義
 * E2E/Storybookとの型干渉を防ぐため分離
 * globalThis 名前空間を使用して意図せぬ汚染を防止
 */
declare global {
  namespace globalThis {
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
        getUser: jest.MockedFunction<() => Promise<any>>;
        verifyOtp: jest.MockedFunction<(params: any) => Promise<any>>;
        resend: jest.MockedFunction<(params: any) => Promise<any>>;
      };
      from: jest.MockedFunction<(table: string) => any>;
    };

    var mockStripe: any;
    var mockResend: any;
    var mockRateLimit: any;
    var mockRedis: any;
    var mockHeaders: any;
    var mockCookies: any;

    var testSupabaseConnection: jest.MockedFunction<() => Promise<boolean>>;

    // Jest環境専用のfetch mock
    var fetch: jest.MockedFunction<typeof fetch>;
  }

  namespace jest {
    interface Matchers<R> {
      toMatchObject(expected: Record<string, any>): R;
    }
  }
}

export {};
