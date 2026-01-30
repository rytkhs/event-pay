import {
  generateCorrelationId,
  respondWithCode,
  respondWithProblem,
  toProblemDetails,
  type ProblemDetails,
} from "@core/errors/adapters/http-adapter";
import { AppError } from "@core/errors/app-error";

// ログ出力によるテストノイズを抑制するためにモック化
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: jest.fn(),
}));

describe("core/errors/adapters/http-adapter", () => {
  describe("generateCorrelationId", () => {
    it("should generate a unique ID with req_ prefix", () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^req_[a-f0-9]{16}$/);

      const id2 = generateCorrelationId();
      expect(id).not.toBe(id2);
    });
  });

  describe("toProblemDetails", () => {
    it("should use userMessage for detail by default to avoid leaking internal info", () => {
      const error = new AppError("VALIDATION_ERROR", {
        message: "Internal developer message (leaky)",
        userMessage: "ユーザー向けの安全なメッセージ",
        correlationId: "req_test123",
      });

      const problem = toProblemDetails(error, { instance: "/api/test" });

      expect(problem.type).toBe("https://minnano-shukin.com/errors/validation-error");
      expect(problem.title).toBe("Validation failed");
      expect(problem.status).toBe(422);
      expect(problem.detail).toBe("ユーザー向けの安全なメッセージ");
      expect(problem.instance).toBe("/api/test");
      expect(problem.code).toBe("VALIDATION_ERROR");
      expect(problem.correlation_id).toBe("req_test123");
    });

    it("should allow overriding detail via options", () => {
      const error = new AppError("VALIDATION_ERROR");
      const problem = toProblemDetails(error, { detail: "Overridden detail" });
      expect(problem.detail).toBe("Overridden detail");
    });

    it("should use generated correlation id if not provided", () => {
      const error = new AppError("INTERNAL_ERROR");
      const problem = toProblemDetails(error);

      expect(problem.correlation_id).toMatch(/^req_[a-f0-9]{16}$/);
    });

    it("should include optional errors array", () => {
      const error = new AppError("VALIDATION_ERROR");
      const problem = toProblemDetails(error, {
        errors: [{ pointer: "/query/id", code: "invalid", message: "Invalid ID" }],
      });

      expect(problem.errors).toHaveLength(1);
      expect(problem.errors![0].pointer).toBe("/query/id");
    });

    it("should include debug info when NODE_ENV is development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      try {
        const error = new AppError("INTERNAL_ERROR", { message: "Detailed DB error" });
        const problem = toProblemDetails(error);
        expect(problem.debug).toBe("Detailed DB error");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("should not include debug info when NODE_ENV is not development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        const error = new AppError("INTERNAL_ERROR", { message: "Detailed DB error" });
        const problem = toProblemDetails(error);
        expect(problem.debug).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe("respondWithCode", () => {
    it("should return NextResponse with Problem Details", async () => {
      const res = respondWithCode("UNAUTHORIZED", { instance: "/api/auth" });

      expect(res.status).toBe(401);
      expect(res.headers.get("Content-Type")).toBe("application/problem+json");
      expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");

      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.status).toBe(401);
    });

    it("should add Retry-After header for rate limited", async () => {
      const res = respondWithCode("RATE_LIMITED", { instance: "/api/test" });

      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
    });

    it("should set Cache-Control: no-store", () => {
      const res = respondWithCode("NOT_FOUND");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("respondWithProblem", () => {
    it("should normalize unknown error and hide internal message from detail", async () => {
      const genericError = new Error("Something sensitive happened in DB");
      const res = respondWithProblem(genericError, { instance: "/api/test" });

      expect(res.status).toBe(500);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("INTERNAL_ERROR");
      // Should use registry default user message, not the Error.message
      expect(body.detail).toBe(
        "システムエラーが発生しました。しばらく時間をおいて再度お試しください。"
      );
    });

    it("should use provided defaultCode", async () => {
      const genericError = new Error("DB failure");
      const res = respondWithProblem(genericError, {
        instance: "/api/db",
        defaultCode: "DATABASE_ERROR",
      });

      expect(res.status).toBe(500);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("DATABASE_ERROR");
    });

    it("should pass through AppError unchanged", async () => {
      const appError = new AppError("EVENT_NOT_FOUND", { message: "Event 123 not found" });
      const res = respondWithProblem(appError);

      expect(res.status).toBe(404);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("EVENT_NOT_FOUND");
    });
  });
});
