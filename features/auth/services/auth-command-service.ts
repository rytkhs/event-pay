import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";

import {
  AccountLockoutService,
  TimingAttackProtection,
  InputSanitizer,
  ACCOUNT_LOCKOUT_CONFIG,
  type LockoutResult,
  type LockoutStatus,
} from "@core/auth-security";
import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit/index";
import { isResetPasswordResult, hasAuthErrorCode } from "@core/supabase/auth-guards";
import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { handleServerError } from "@core/utils/error-handler.server";
import { formatUtcToJst } from "@core/utils/timezone";
import {
  completePasswordResetInputSchema,
  emailCheckSchema,
  loginInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  verifyOtpInputSchema,
} from "@core/validation/auth";

import type {
  AuthCommandResult,
  AuthRateLimitScope,
  CompletePasswordResetCommandInput,
  LoginCommandInput,
  RegisterCommandInput,
  ResendOtpCommandInput,
  ResetPasswordCommandInput,
  VerifyOtpCommandInput,
} from "./auth-command-service.types";

type AuthRateLimitOptions = {
  scope: AuthRateLimitScope;
  email: string;
  ip?: string;
  blockedMessage: string;
  failureLogMessage: string;
  normalizeEmail?: (email: string) => string;
  withConstantDelay?: () => Promise<void>;
};

function validationErrorResult(
  userMessage: string,
  fieldErrors?: Record<string, string[] | undefined>
): AuthCommandResult<never> {
  return errResult(
    new AppError("VALIDATION_ERROR", {
      userMessage,
      details: fieldErrors,
    })
  );
}

async function checkAuthRateLimit(
  options: AuthRateLimitOptions
): Promise<AuthCommandResult<never> | null> {
  try {
    const normalizedEmail = options.normalizeEmail
      ? options.normalizeEmail(options.email)
      : options.email;

    const keyInput = buildKey({
      scope: options.scope,
      ip: options.ip,
      email: normalizedEmail,
    });

    const rateLimitResult = await enforceRateLimit({
      keys: Array.isArray(keyInput) ? keyInput : [keyInput],
      policy: POLICIES[options.scope],
    });

    if (!rateLimitResult.allowed) {
      if (options.withConstantDelay) {
        await options.withConstantDelay();
      }

      return errResult(
        new AppError("RATE_LIMITED", {
          userMessage: options.blockedMessage,
          retryable: true,
        })
      );
    }
  } catch (rateLimitError) {
    logger.warn(options.failureLogMessage, {
      category: "security",
      action: "rateLimitCheckFailed",
      error_name: rateLimitError instanceof Error ? rateLimitError.name : "Unknown",
      error_message:
        rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError),
    });
  }

  return null;
}

function mapLoginAuthErrorResult(params: {
  signInError: unknown;
  sanitizedEmail: string;
  lockoutResult: LockoutResult;
}): AuthCommandResult<never> {
  if (params.lockoutResult.isLocked) {
    return errResult(
      new AppError("FORBIDDEN", {
        userMessage: "アカウントがロックされました。しばらく時間をおいてからお試しください。",
      })
    );
  }

  if (hasAuthErrorCode(params.signInError, "email_not_confirmed")) {
    return errResult(
      new AppError("LOGIN_FAILED", {
        userMessage: "メールアドレスの確認が必要です。",
      }),
      {
        redirectUrl: `/verify-email?email=${encodeURIComponent(params.sanitizedEmail)}`,
        needsVerification: true,
      }
    );
  }

  let errorMessage = "メールアドレスまたはパスワードが正しくありません";

  if (params.lockoutResult.failedAttempts >= 3) {
    const remaining =
      ACCOUNT_LOCKOUT_CONFIG.maxFailedAttempts - params.lockoutResult.failedAttempts;
    errorMessage += ` (残り${remaining}回の試行でアカウントがロックされます)`;
  }

  return errResult(
    new AppError("LOGIN_FAILED", {
      userMessage: errorMessage,
    })
  );
}

function mapRegisterAuthErrorResult(signUpError: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(signUpError, "user_already_exists")) {
    return errResult(
      new AppError("ALREADY_EXISTS", {
        userMessage: "このメールアドレスは既に登録されています",
      })
    );
  }

  if (hasAuthErrorCode(signUpError, "over_email_send_limit")) {
    return errResult(
      new AppError("RATE_LIMITED", {
        userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        retryable: true,
      })
    );
  }

  return errResult(
    new AppError("REGISTRATION_UNEXPECTED_ERROR", {
      userMessage: "登録処理中にエラーが発生しました",
    })
  );
}

function mapVerifyOtpErrorResult(verifiedError: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(verifiedError, "otp_expired")) {
    return errResult(
      new AppError("OTP_EXPIRED", {
        userMessage: "確認コードが無効、もしくは有効期限が切れています",
      })
    );
  }

  if (hasAuthErrorCode(verifiedError, "otp_invalid")) {
    return errResult(
      new AppError("OTP_INVALID", {
        userMessage: "無効な確認コードです",
      })
    );
  }

  return errResult(
    new AppError("OTP_INVALID", {
      userMessage: "確認コードが正しくありません",
    })
  );
}

function mapResendOtpErrorResult(error: unknown): AuthCommandResult<never> {
  if (hasAuthErrorCode(error, "over_email_send_limit")) {
    return errResult(
      new AppError("RATE_LIMITED", {
        userMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
        retryable: true,
      })
    );
  }

  return errResult(
    new AppError("RESEND_OTP_UNEXPECTED_ERROR", {
      userMessage: "再送信中にエラーが発生しました",
    })
  );
}

export async function loginAction(
  input: LoginCommandInput
): Promise<AuthCommandResult<{ user: unknown }>> {
  try {
    const validationResult = loginInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { email, password } = validationResult.data;

    let sanitizedEmail: string;
    let sanitizedPassword: string;

    try {
      sanitizedEmail = InputSanitizer.sanitizeEmail(email);
      sanitizedPassword = InputSanitizer.sanitizePassword(password);
    } catch {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult("入力内容を確認してください");
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.login",
      email: sanitizedEmail,
      ip: input.requestContext.ip,
      blockedMessage: "ログイン試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const lockoutStatus: LockoutStatus =
      await AccountLockoutService.checkLockoutStatus(sanitizedEmail);
    if (lockoutStatus.isLocked) {
      await TimingAttackProtection.normalizeResponseTime(async () => {}, 300);
      return errResult(
        new AppError("FORBIDDEN", {
          userMessage: `アカウントがロックされています。${lockoutStatus.lockoutExpiresAt ? formatUtcToJst(lockoutStatus.lockoutExpiresAt, "HH:mm") : ""}頃に再試行してください。`,
        })
      );
    }

    const supabase = await createServerActionSupabaseClient();

    const authResult = await TimingAttackProtection.normalizeResponseTime(
      async () =>
        await supabase.auth.signInWithPassword({
          email: sanitizedEmail,
          password: sanitizedPassword,
        }),
      300
    );

    const { data: signInData, error: signInError } = authResult;

    if (signInError) {
      handleServerError(signInError, {
        category: "authentication",
        action: "loginFailed",
        additionalData: {
          sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      const lockoutResult = await AccountLockoutService.recordFailedAttempt(sanitizedEmail);
      return mapLoginAuthErrorResult({
        signInError,
        sanitizedEmail,
        lockoutResult,
      });
    }

    await AccountLockoutService.clearFailedAttempts(sanitizedEmail);

    return okResult(
      {
        user: signInData?.user,
      },
      {
        message: "ログインしました",
        redirectUrl: "/dashboard",
        sideEffects: {
          telemetry: {
            name: "login",
            method: "password",
            userId: signInData?.user?.id,
          },
        },
      }
    );
  } catch (error) {
    handleServerError("LOGIN_UNEXPECTED_ERROR", {
      action: "loginActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return errResult(
      new AppError("LOGIN_UNEXPECTED_ERROR", {
        userMessage: "ログイン処理中にエラーが発生しました",
      })
    );
  }
}

export async function registerAction(
  input: RegisterCommandInput
): Promise<AuthCommandResult<{ user: unknown }>> {
  try {
    const validationResult = registerInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { name, email, password } = validationResult.data;

    const sanitizedEmail = InputSanitizer.sanitizeEmail(email);
    const sanitizedPassword = InputSanitizer.sanitizePassword(password);
    const sanitizedName = name.trim();

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.register",
      email: sanitizedEmail,
      ip: input.requestContext.ip,
      blockedMessage: "登録試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during registration",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    const registrationResult = await TimingAttackProtection.normalizeResponseTime(
      async () =>
        await supabase.auth.signUp({
          email: sanitizedEmail,
          password: sanitizedPassword,
          options: {
            data: {
              name: sanitizedName,
              terms_agreed: true,
            },
          },
        }),
      400
    );

    const { data: signUpData, error: signUpError } = registrationResult;

    if (signUpError) {
      handleServerError(signUpError, {
        category: "authentication",
        action: "registrationFailed",
        additionalData: {
          sanitized_email: sanitizedEmail.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      return mapRegisterAuthErrorResult(signUpError);
    }

    return okResult(
      {
        user: signUpData?.user,
      },
      {
        needsVerification: true,
        message: "登録が完了しました。確認メールを送信しました。",
        redirectUrl: `/verify-otp?email=${encodeURIComponent(sanitizedEmail)}`,
        sideEffects: {
          telemetry: {
            name: "sign_up",
            method: "password",
            userId: signUpData?.user?.id,
          },
          accountCreatedSlack: {
            userName: sanitizedName,
          },
        },
      }
    );
  } catch (error) {
    handleServerError("REGISTRATION_UNEXPECTED_ERROR", {
      action: "registerActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    await TimingAttackProtection.addConstantDelay();
    return errResult(
      new AppError("REGISTRATION_UNEXPECTED_ERROR", {
        userMessage: "登録処理中にエラーが発生しました",
      })
    );
  }
}

export async function verifyOtpAction(input: VerifyOtpCommandInput): Promise<AuthCommandResult> {
  try {
    const validationResult = verifyOtpInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { email, otp, type } = validationResult.data;
    const supabase = await createServerActionSupabaseClient();

    const { error: verifiedError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: type as EmailOtpType,
    });

    if (verifiedError) {
      handleServerError(verifiedError, {
        category: "authentication",
        action: "otpVerificationFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      return mapVerifyOtpErrorResult(verifiedError);
    }

    let redirectUrl = "/dashboard";
    let message = "メールアドレスが確認されました";

    if (type === "recovery") {
      redirectUrl = "/reset-password/update";
      message = "パスワードリセットの確認が完了しました";
    } else if (type === "email") {
      redirectUrl = "/dashboard";
      message = "メールアドレスが確認されました";
    } else if (type === "email_change") {
      redirectUrl = "/settings";
      message = "メールアドレス変更が完了しました";
    } else if (type === "signup") {
      redirectUrl = "/dashboard";
      message = "アカウント登録が完了しました";
    }

    return okResult(undefined, {
      message,
      redirectUrl,
    });
  } catch (error) {
    handleServerError("OTP_UNEXPECTED_ERROR", {
      action: "verifyOtpActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return errResult(
      new AppError("OTP_UNEXPECTED_ERROR", {
        userMessage: "確認処理中にエラーが発生しました",
      })
    );
  }
}

export async function resendOtpAction(input: ResendOtpCommandInput): Promise<AuthCommandResult> {
  try {
    const email = input.email;
    const type = input.type ?? "signup";

    if (!email || !emailCheckSchema.safeParse(email).success) {
      return errResult(
        new AppError("VALIDATION_ERROR", {
          userMessage: "有効なメールアドレスを入力してください",
        })
      );
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.emailResend",
      email,
      ip: input.requestContext.ip,
      blockedMessage: "送信回数の上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during email resend",
      normalizeEmail: InputSanitizer.sanitizeEmail,
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    let resendResult;

    if (type === "recovery") {
      resendResult = await supabase.auth.resetPasswordForEmail(email);
    } else if (type === "signup" || type === "email_change") {
      resendResult = await supabase.auth.resend({
        type: type as "signup" | "email_change",
        email,
      });
    } else {
      return errResult(
        new AppError("INVALID_REQUEST", {
          userMessage: "このタイプの再送信は現在サポートしていません",
        })
      );
    }

    if (resendResult.error) {
      handleServerError(resendResult.error, {
        category: "authentication",
        action: "resendOtpFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });

      return mapResendOtpErrorResult(resendResult.error);
    }

    return okResult(undefined, {
      message: "確認コードを再送信しました",
    });
  } catch (error) {
    handleServerError("RESEND_OTP_UNEXPECTED_ERROR", {
      action: "resendOtpActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return errResult(
      new AppError("RESEND_OTP_UNEXPECTED_ERROR", {
        userMessage: "再送信中にエラーが発生しました",
      })
    );
  }
}

export async function resetPasswordAction(
  input: ResetPasswordCommandInput
): Promise<AuthCommandResult> {
  try {
    const validationResult = resetPasswordInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult(
        "有効なメールアドレスを入力してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    let { email } = validationResult.data;

    try {
      email = InputSanitizer.sanitizeEmail(email);
    } catch {
      await TimingAttackProtection.addConstantDelay();
      return validationErrorResult("有効なメールアドレスを入力してください");
    }

    const rateLimitError = await checkAuthRateLimit({
      scope: "auth.passwordReset",
      email,
      ip: input.requestContext.ip,
      blockedMessage:
        "パスワードリセット試行回数が上限に達しました。しばらく時間をおいてからお試しください",
      failureLogMessage: "Rate limit check failed during password reset",
      withConstantDelay: async () => await TimingAttackProtection.addConstantDelay(),
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const supabase = await createServerActionSupabaseClient();

    const resetResult = await TimingAttackProtection.normalizeResponseTime(
      async () => await supabase.auth.resetPasswordForEmail(email),
      300
    );

    if (isResetPasswordResult(resetResult) && resetResult.error) {
      handleServerError(resetResult.error, {
        category: "authentication",
        action: "resetPasswordOtpFailed",
        additionalData: {
          sanitized_email: email.replace(/(.)(.*)(@.*)/, "$1***$3"),
        },
      });
    }

    return okResult(undefined, {
      message: "パスワードリセット用の確認コードを送信しました（登録済みのアドレスの場合）",
      needsVerification: true,
      redirectUrl: `/verify-otp?email=${encodeURIComponent(email)}&type=recovery`,
    });
  } catch (error) {
    handleServerError("RESET_PASSWORD_UNEXPECTED_ERROR", {
      action: "resetPasswordActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    await TimingAttackProtection.addConstantDelay();
    return errResult(
      new AppError("RESET_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "処理中にエラーが発生しました",
      })
    );
  }
}

export async function completePasswordResetAction(
  input: CompletePasswordResetCommandInput
): Promise<AuthCommandResult> {
  try {
    const validationResult = completePasswordResetInputSchema.safeParse(input.rawData);

    if (!validationResult.success) {
      return validationErrorResult(
        "入力内容を確認してください",
        validationResult.error.flatten().fieldErrors
      );
    }

    const { password } = validationResult.data;
    const supabase = await createServerActionSupabaseClient();

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return errResult(
        new AppError("TOKEN_EXPIRED", {
          userMessage: "セッションが期限切れです。確認コードを再入力してください",
        }),
        {
          redirectUrl: "/verify-otp",
        }
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      handleServerError(updateError, {
        category: "authentication",
        action: "updatePasswordFailed",
        actorType: "user",
      });
      return errResult(
        new AppError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
          userMessage: "パスワードの更新に失敗しました",
        })
      );
    }

    return okResult(undefined, {
      message: "パスワードが更新されました",
      redirectUrl: "/dashboard",
    });
  } catch (error) {
    handleServerError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
      action: "updatePasswordActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return errResult(
      new AppError("UPDATE_PASSWORD_UNEXPECTED_ERROR", {
        userMessage: "処理中にエラーが発生しました",
      })
    );
  }
}

export async function logoutAction(): Promise<AuthCommandResult> {
  try {
    const supabase = await createServerActionSupabaseClient();

    let userId: string | undefined;
    try {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id;
    } catch {
      // ユーザー取得エラーは無視
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.warn("Logout error (non-critical)", {
        category: "authentication",
        action: "logoutError",
        error_message: error.message,
      });
    }

    return okResult(undefined, {
      message: "ログアウトしました",
      redirectUrl: "/login",
      sideEffects: {
        telemetry: {
          name: "logout",
          userId,
        },
      },
    });
  } catch (error) {
    handleServerError("LOGOUT_UNEXPECTED_ERROR", {
      action: "logoutActionError",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    await TimingAttackProtection.addConstantDelay();
    return errResult(
      new AppError("LOGOUT_UNEXPECTED_ERROR", {
        userMessage: "ログアウト処理中にエラーが発生しました。再度お試しください。",
      }),
      {
        redirectUrl: "/login",
      }
    );
  }
}
