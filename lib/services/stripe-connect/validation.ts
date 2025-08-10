/**
 * StripeConnect バリデーション関数
 */

import { z } from "zod";
import {
  CreateExpressAccountParams,
  CreateAccountLinkParams,
  UpdateAccountStatusParams,
  StripeConnectError,
  StripeConnectErrorType,
} from "./types";

/**
 * Express Account作成パラメータのバリデーションスキーマ
 */
export const createExpressAccountSchema = z.object({
  userId: z.string().uuid("有効なユーザーIDを指定してください"),
  email: z.string().email("有効なメールアドレスを指定してください"),
  country: z.string().length(2, "国コードは2文字で指定してください").optional().default("JP"),
  businessType: z.enum(["individual", "company"]).optional().default("individual"),
  businessProfile: z
    .object({
      url: z.string().url().optional(),
      productDescription: z.string().max(500).optional(),
    })
    .optional(),
});

/**
 * Account Link生成パラメータのバリデーションスキーマ
 */
export const createAccountLinkSchema = z.object({
  accountId: z.string().min(1, "アカウントIDを指定してください"),
  refreshUrl: z.string().url("有効なリフレッシュURLを指定してください"),
  returnUrl: z.string().url("有効なリターンURLを指定してください"),
  type: z.enum(["account_onboarding", "account_update"]).optional().default("account_onboarding"),
  collectionOptions: z
    .object({
      fields: z.enum(["currently_due", "eventually_due"]).optional(),
      futureRequirements: z.enum(["include", "omit"]).optional(),
    })
    .optional(),
});

/**
 * アカウントステータス更新パラメータのバリデーションスキーマ
 */
export const updateAccountStatusSchema = z.object({
  userId: z.string().uuid("有効なユーザーIDを指定してください"),
  status: z.enum(["unverified", "onboarding", "verified", "restricted"]),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  stripeAccountId: z.string().optional(),
});

/**
 * Express Account作成パラメータのバリデーション
 */
export const validateCreateExpressAccountParams = (
  params: unknown
): CreateExpressAccountParams => {
  try {
    return createExpressAccountSchema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new StripeConnectError(
        StripeConnectErrorType.VALIDATION_ERROR,
        `Express Account作成パラメータが無効です: ${message}`,
        error
      );
    }
    throw new StripeConnectError(
      StripeConnectErrorType.VALIDATION_ERROR,
      "Express Account作成パラメータの検証に失敗しました",
      error as Error
    );
  }
};

/**
 * Account Link生成パラメータのバリデーション
 */
export const validateCreateAccountLinkParams = (
  params: unknown
): CreateAccountLinkParams => {
  try {
    return createAccountLinkSchema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new StripeConnectError(
        StripeConnectErrorType.VALIDATION_ERROR,
        `Account Link生成パラメータが無効です: ${message}`,
        error
      );
    }
    throw new StripeConnectError(
      StripeConnectErrorType.VALIDATION_ERROR,
      "Account Link生成パラメータの検証に失敗しました",
      error as Error
    );
  }
};

/**
 * アカウントステータス更新パラメータのバリデーション
 */
export const validateUpdateAccountStatusParams = (
  params: unknown
): UpdateAccountStatusParams => {
  try {
    return updateAccountStatusSchema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new StripeConnectError(
        StripeConnectErrorType.VALIDATION_ERROR,
        `アカウントステータス更新パラメータが無効です: ${message}`,
        error
      );
    }
    throw new StripeConnectError(
      StripeConnectErrorType.VALIDATION_ERROR,
      "アカウントステータス更新パラメータの検証に失敗しました",
      error as Error
    );
  }
};

/**
 * Stripe Account IDの形式チェック
 */
export const validateStripeAccountId = (accountId: string): void => {
  if (!accountId || typeof accountId !== 'string') {
    throw new StripeConnectError(
      StripeConnectErrorType.VALIDATION_ERROR,
      "Stripe Account IDが指定されていません"
    );
  }

  // Stripe Connect Account IDは "acct_" で始まる
  if (!accountId.startsWith('acct_')) {
    throw new StripeConnectError(
      StripeConnectErrorType.VALIDATION_ERROR,
      "無効なStripe Account ID形式です"
    );
  }
};

/**
 * ユーザーIDの形式チェック
 */
export const validateUserId = (userId: string): void => {
  if (!userId || typeof userId !== 'string') {
    throw new StripeConnectError(
      StripeConnectErrorType.VALIDATION_ERROR,
      "ユーザーIDが指定されていません"
    );
  }

  // UUIDの形式チェック
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    throw new StripeConnectError(
      StripeConnectErrorType.VALIDATION_ERROR,
      "無効なユーザーID形式です"
    );
  }
};
