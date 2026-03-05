import type { AppResult } from "@core/errors";

export type AuthRateLimitScope =
  | "auth.login"
  | "auth.register"
  | "auth.passwordReset"
  | "auth.emailResend";

export type AuthTelemetryEvent =
  | {
      name: "login" | "sign_up";
      userId?: string;
      method: "password";
    }
  | {
      name: "logout";
      userId?: string;
    };

export type AuthSideEffects = {
  telemetry?: AuthTelemetryEvent;
  accountCreatedSlack?: {
    userName: string;
  };
};

export type AuthCommandMeta = {
  message?: string;
  redirectUrl?: string;
  needsVerification?: boolean;
  sideEffects?: AuthSideEffects;
};

export type AuthCommandResult<T = void> = AppResult<T, AuthCommandMeta>;

export type AuthRequestContext = {
  ip?: string;
};

export type LoginCommandInput = {
  rawData: Record<string, string>;
  requestContext: AuthRequestContext;
};

export type RegisterCommandInput = {
  rawData: Record<string, string>;
  requestContext: AuthRequestContext;
};

export type VerifyOtpCommandInput = {
  rawData: Record<string, string>;
};

export type ResendOtpCommandInput = {
  email?: string;
  type?: string;
  requestContext: AuthRequestContext;
};

export type ResetPasswordCommandInput = {
  rawData: Record<string, string>;
  requestContext: AuthRequestContext;
};

export type CompletePasswordResetCommandInput = {
  rawData: Record<string, string>;
};
