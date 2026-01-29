import { z } from "zod";

import { AppError } from "@core/errors/app-error";
import { normalizeError } from "@core/errors/normalize";
import { ERROR_REGISTRY } from "@core/errors/registry";

describe("core/errors", () => {
  describe("AppError", () => {
    it("should create an error with default values from registry", () => {
      const error = new AppError("NOT_FOUND");
      const def = ERROR_REGISTRY.NOT_FOUND;

      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe(def.message);
      expect(error.userMessage).toBe(def.userMessage);
      expect(error.severity).toBe(def.severity);
      expect(error.retryable).toBe(def.retryable);
      expect(error.httpStatus).toBe(def.httpStatus);
      expect(error.category).toBe(def.category);
      expect(error.typeUri).toBe(def.typeUri);
    });

    it("should allow overriding options", () => {
      const error = new AppError("INTERNAL_ERROR", {
        message: "Custom system error",
        userMessage: "カスタムユーザーメッセージ",
        severity: "critical",
        retryable: false,
      });

      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.message).toBe("Custom system error");
      expect(error.userMessage).toBe("カスタムユーザーメッセージ");
      expect(error.severity).toBe("critical");
      expect(error.retryable).toBe(false);
      // Registry values should still be inherited
      expect(error.httpStatus).toBe(500);
      expect(error.category).toBe("system");
    });

    it("should handle unknown error codes safely", () => {
      const error = new AppError("INVALID_CODE_XYZ" as any, {
        correlationId: "unknown-track-id",
      });

      expect(error.name).toBe("AppError");
      expect(error.code).toBe("UNKNOWN_ERROR");
      expect(error.message).toContain("Undefined error code: INVALID_CODE_XYZ");
      expect(error.httpStatus).toBe(500);
      expect(error.category).toBe("unknown");
      expect(error.correlationId).toBe("unknown-track-id");
    });

    it("should serialize to JSON correctly", () => {
      const error = new AppError("VALIDATION_ERROR", {
        details: { field: "email", reason: "invalid" },
        correlationId: "test-id-123",
      });

      const json = error.toJSON();

      expect(json).toEqual({
        name: "AppError",
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        userMessage: ERROR_REGISTRY.VALIDATION_ERROR.userMessage,
        severity: "low",
        retryable: false,
        httpStatus: 422,
        category: "validation",
        typeUri: ERROR_REGISTRY.VALIDATION_ERROR.typeUri,
        details: { field: "email", reason: "invalid" },
        correlationId: "test-id-123",
      });
    });
  });

  describe("normalizeError", () => {
    it("should return AppError as is", () => {
      const original = new AppError("FORBIDDEN");
      const normalized = normalizeError(original);

      expect(normalized).toBe(original);
    });

    it("should convert generic Error to AppError", () => {
      const err = new Error("Something went wrong");
      const normalized = normalizeError(err);

      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.code).toBe("INTERNAL_ERROR"); // Default
      expect(normalized.message).toBe("Something went wrong");
      expect(normalized.cause).toBe(err);
    });

    it("should convert ZodError to VALIDATION_ERROR", () => {
      const schema = z.object({ email: z.string().email() });
      const result = schema.safeParse({ email: "invalid-email" });

      if (result.success) throw new Error("Validation should fail");

      const normalized = normalizeError(result.error);

      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.code).toBe("VALIDATION_ERROR");
      expect(normalized.cause).toBe(result.error);
      expect(normalized.details).toHaveProperty("email");
    });

    it("should convert string error to AppError", () => {
      const normalized = normalizeError("String error message");

      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.code).toBe("INTERNAL_ERROR");
      expect(normalized.message).toBe("String error message");
    });

    it("should convert unknown object to AppError", () => {
      const obj = { foo: "bar" };
      const normalized = normalizeError(obj);

      expect(normalized).toBeInstanceOf(AppError);
      expect(normalized.message).toBe("Non-error object thrown");
      expect(normalized.details.type).toBe("object");
      expect(normalized.details.preview).toContain("[object Object]");
    });

    it("should use defaultCode if provided", () => {
      const err = new Error("Not found error");
      const normalized = normalizeError(err, "NOT_FOUND");

      expect(normalized.code).toBe("NOT_FOUND");
    });
  });
});
