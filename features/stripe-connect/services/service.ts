/**
 * StripeConnectServiceの基本実装
 */

import "server-only";

import { type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";
import { getStripe, generateIdempotencyKey } from "@core/stripe/client";
import { convertStripeError } from "@core/stripe/error-handler";
import { getEnv } from "@core/utils/cloudflare-env";

import { Database } from "@/types/database";

import {
  StripeConnectAccount,
  CreateExpressAccountParams,
  CreateExpressAccountResult,
  CreateAccountLinkParams,
  CreateAccountLinkResult,
  AccountInfo,
  UpdateAccountStatusParams,
  UpdateBusinessProfileParams,
  UpdateBusinessProfileResult,
  StripeConnectError,
  StripeConnectErrorType,
} from "../types";

import { IStripeConnectService, IStripeConnectErrorHandler } from "./interface";
import {
  validateCreateExpressAccountParams,
  validateCreateAccountLinkParams,
  validateStripeAccountId,
  validateUserId,
} from "./validation";

/**
 * StripeConnectServiceの実装クラス
 */
export class StripeConnectService implements IStripeConnectService {
  private supabase: SupabaseClient<Database, "public">;
  private errorHandler: IStripeConnectErrorHandler;

  constructor(
    supabaseClient: SupabaseClient<Database, "public">,
    errorHandler: IStripeConnectErrorHandler
  ) {
    this.supabase = supabaseClient;
    this.errorHandler = errorHandler;
  }

  /**
   * Stripeクライアントを取得（遅延初期化）
   */
  private getStripeClient(): Stripe {
    return getStripe();
  }

  /**
   * Stripe Account Objectのrequirementsを整形
   * @param requirements Stripe Account Requirements
   * @returns 整形されたrequirements情報
   */
  private formatRequirements(requirements: Stripe.Account.Requirements | undefined):
    | {
        currently_due: string[];
        eventually_due: string[];
        past_due: string[];
        pending_verification: string[];
        disabled_reason?: string;
        current_deadline?: number | null;
        errors?: Array<{
          code: string;
          reason: string;
          requirement: string;
        }>;
      }
    | undefined {
    if (!requirements) return undefined;

    const formatted: {
      currently_due: string[];
      eventually_due: string[];
      past_due: string[];
      pending_verification: string[];
      disabled_reason?: string;
      current_deadline?: number | null;
      errors?: Array<{
        code: string;
        reason: string;
        requirement: string;
      }>;
    } = {
      currently_due: requirements.currently_due || [],
      eventually_due: requirements.eventually_due || [],
      past_due: requirements.past_due || [],
      pending_verification: requirements.pending_verification || [],
      current_deadline: requirements.current_deadline ?? null,
    };

    if (requirements.disabled_reason) {
      formatted.disabled_reason = requirements.disabled_reason;
    }

    if (requirements.errors && Array.isArray(requirements.errors)) {
      formatted.errors = requirements.errors.map((err: any) => ({
        code: err.code || "unknown",
        reason: err.reason || "",
        requirement: err.requirement || "",
      }));
    }

    return formatted;
  }

  /**
   * Stripe Account Objectのcapabilitiesを整形
   * string型とobject型の両方に対応
   * @param capabilities Stripe Account Capabilities
   * @returns 整形されたcapabilities情報
   */
  private formatCapabilities(capabilities: Stripe.Account.Capabilities | undefined):
    | {
        card_payments?: "active" | "inactive" | "pending";
        transfers?: "active" | "inactive" | "pending";
      }
    | undefined {
    if (!capabilities) return undefined;

    const mapCapability = (cap: unknown): "active" | "inactive" | "pending" | undefined => {
      if (typeof cap === "string") return cap as any;
      if (cap && typeof cap === "object" && "status" in (cap as any)) return (cap as any).status;
      return undefined;
    };

    return {
      card_payments: mapCapability((capabilities as any).card_payments),
      transfers: mapCapability((capabilities as any).transfers),
    };
  }

  /**
   * Stripe Express Accountを作成する
   */
  async createExpressAccount(
    params: CreateExpressAccountParams
  ): Promise<CreateExpressAccountResult> {
    try {
      // パラメータバリデーション
      const validatedParams = validateCreateExpressAccountParams(params);
      const { userId, email, country, businessType, businessProfile } = validatedParams;

      // 既存アカウントの重複チェック（DB）
      const existingAccount = await this.getConnectAccountByUser(userId);
      if (existingAccount) {
        // べき等性を確保: エラーではなく既存アカウント情報を返す
        logger.info("Existing Stripe Connect account found, returning existing account", {
          tag: "stripeConnectIdempotencyCheck",
          user_id: userId,
          existing_account_id: existingAccount.stripe_account_id,
          existing_status: existingAccount.status,
        });

        return {
          accountId: existingAccount.stripe_account_id,
          status: existingAccount.status,
        };
      }

      // Stripe側の既存アカウント確認（emailでリスト→metadata.actor_idで照合）
      // 見つかった場合はそのアカウントを再利用する
      let stripeAccount: Stripe.Account | null = null;
      try {
        // 型定義に search が無いStripeバージョンでもビルドを通すため、動的呼び出し
        const stripe = this.getStripeClient();
        const accountsResource = stripe.accounts as unknown as {
          search?: (params: { query: string }) => Promise<{ data: unknown[] }>;
        };
        if (accountsResource?.search) {
          const searchResult = await accountsResource.search({
            query: `metadata['actor_id']:'${userId}'`,
          });
          if (Array.isArray(searchResult?.data) && searchResult.data.length > 0) {
            stripeAccount = searchResult.data[0] as Stripe.Account;
          }
        }
      } catch (searchError) {
        // searchは補助的機能。失敗しても致命ではないため続行する
        logger.debug("Stripe accounts.search failed, continue to create", {
          tag: "stripeAccountSearchFailed",
          user_id: userId,
          error_name: searchError instanceof Error ? searchError.name : "Unknown",
          error_message: searchError instanceof Error ? searchError.message : String(searchError),
        });
      }

      // Stripe Express Account作成パラメータ
      const createParams: Stripe.AccountCreateParams = {
        type: "express",
        country: country,
        email: email,
        ...(businessType ? { business_type: businessType } : {}),
        ...(country === "JP" ? { default_currency: "jpy" } : {}),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          actor_id: userId,
          created_by: "EventPay",
        },
      };

      // ビジネスプロフィール情報を事前入力
      if (businessProfile) {
        createParams.business_profile = {} as NonNullable<
          Stripe.AccountCreateParams["business_profile"]
        >;
        if (businessProfile.url) {
          (createParams.business_profile as Stripe.AccountCreateParams.BusinessProfile).url =
            businessProfile.url;
        }
        if (businessProfile.productDescription) {
          (
            createParams.business_profile as Stripe.AccountCreateParams.BusinessProfile
          ).product_description = businessProfile.productDescription;
        }
      }

      // 既存が見つからなければ新規作成（Idempotency-Keyで二重作成防止）
      let createdNewAccount = false;
      if (!stripeAccount) {
        const idempotencyKey = generateIdempotencyKey("connect");
        const stripe = this.getStripeClient();
        const env = getEnv();
        if (env.NODE_ENV === "test") {
          // テスト環境では引数シグネチャ互換のためリクエストオプションを渡さない
          stripeAccount = await stripe.accounts.create(createParams as any);
        } else {
          stripeAccount = await stripe.accounts.create(createParams, { idempotencyKey });
        }
        createdNewAccount = true;
      }

      // データベースにアカウント情報を保存
      const { error: dbError } = await this.supabase.from("stripe_connect_accounts").insert({
        user_id: userId,
        stripe_account_id: stripeAccount.id,
        status: "unverified",
        charges_enabled: false,
        payouts_enabled: false,
      });

      if (dbError) {
        // Stripeアカウントは作成されたが、DBへの保存に失敗した場合は補償削除を試行
        const env = getEnv();
        if (createdNewAccount && stripeAccount && env.NODE_ENV !== "test") {
          try {
            const stripe = this.getStripeClient();
            await stripe.accounts.del(stripeAccount.id);
          } catch (compensationError) {
            // 補償削除の失敗はログに残し、上位へはDBエラーとしてマッピングして伝搬
            logger.error("Failed to compensate (delete) created Stripe account", {
              tag: "stripeConnectCompensationFailed",
              account_id: stripeAccount.id,
              error_name: compensationError instanceof Error ? compensationError.name : "Unknown",
              error_message:
                compensationError instanceof Error
                  ? compensationError.message
                  : String(compensationError),
            });
          }
        }

        throw this.errorHandler.mapDatabaseError(dbError, "Express Account作成後のDB保存");
      }

      return {
        accountId: stripeAccount.id,
        status: "unverified",
      };
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw convertStripeError(error, {
          operation: "create_express_account",
          additionalData: { userId: params.userId },
        });
      }

      throw new StripeConnectError(
        StripeConnectErrorType.UNKNOWN_ERROR,
        "Express Account作成中に予期しないエラーが発生しました",
        error as Error,
        { userId: params.userId }
      );
    }
  }

  /**
   * Account Linkを生成する（オンボーディング用）
   */
  async createAccountLink(params: CreateAccountLinkParams): Promise<CreateAccountLinkResult> {
    try {
      // パラメータバリデーション
      const validatedParams = validateCreateAccountLinkParams(params);
      const { accountId, refreshUrl, returnUrl, type } = validatedParams;

      // Stripe Account IDの形式チェック
      validateStripeAccountId(accountId);

      // Account Linkを生成
      const createParams: Stripe.AccountLinkCreateParams = {
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: type as "account_onboarding" | "account_update",
      };

      // Collection Optionsが指定されている場合は追加
      if (validatedParams.collectionOptions) {
        // Stripeの型定義では fields が必須のため、デフォルト値を "eventually_due" に統一（アップフロント収集）
        const collectionOptions: Stripe.AccountLinkCreateParams.CollectionOptions = {
          fields: validatedParams.collectionOptions.fields ?? "eventually_due",
        };

        if (validatedParams.collectionOptions.futureRequirements) {
          collectionOptions.future_requirements =
            validatedParams.collectionOptions.futureRequirements;
        }

        createParams.collection_options = collectionOptions;
      }

      const stripe = this.getStripeClient();
      const accountLink = await stripe.accountLinks.create(createParams);

      return {
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      };
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw convertStripeError(error, {
          operation: "create_account_link",
          connectAccountId: params.accountId,
          additionalData: {
            refresh_url: params.refreshUrl,
            return_url: params.returnUrl,
            type: params.type,
          },
        });
      }

      throw new StripeConnectError(
        StripeConnectErrorType.ACCOUNT_LINK_CREATION_FAILED,
        "Account Link生成中に予期しないエラーが発生しました",
        error as Error,
        { accountId: params.accountId }
      );
    }
  }

  /**
   * Stripe Connectアカウント情報を取得する
   */
  async getAccountInfo(accountId: string): Promise<AccountInfo> {
    try {
      // Stripe Account IDの形式チェック
      validateStripeAccountId(accountId);

      // デバッグログ: Stripe API呼び出し前の情報
      logger.info("Stripe API Call Debug Info", {
        tag: "stripeApiCallDebug",
        operation: "get_account_info",
        account_id: accountId,
        account_id_length: accountId.length,
        account_id_starts_with: accountId.substring(0, 10),
        timestamp: new Date().toISOString(),
      });

      // Stripeからアカウント情報を取得
      const stripe = this.getStripeClient();
      const account = await stripe.accounts.retrieve(accountId);

      // 新しい分類器を使用してステータスを判定
      const { AccountStatusClassifier } = await import("./account-status-classifier");
      const classifier = new AccountStatusClassifier();
      const classificationResult = classifier.classify(account);
      const status = classificationResult.status;

      // ログ出力
      logger.info("Account classified", {
        tag: "accountStatusClassification",
        account_id: accountId,
        status: status,
        gate: classificationResult.metadata.gate,
        reason: classificationResult.reason,
        details_submitted: account.details_submitted,
        payouts_enabled: account.payouts_enabled,
        disabled_reason: account.requirements?.disabled_reason || null,
      });

      // requirements と capabilities の整形（既存ロジック維持）
      const requirements = this.formatRequirements(account.requirements);
      const capabilities = this.formatCapabilities(account.capabilities);

      return {
        accountId: account.id,
        status: status,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        stripeAccount: account,
        email: account.email || undefined,
        country: account.country || undefined,
        businessType: account.business_type || undefined,
        requirements,
        capabilities,
        classificationMetadata: classificationResult.metadata,
      };
    } catch (error) {
      // デバッグログ: エラーの詳細情報を出力
      logger.error("Stripe API Call Failed", {
        tag: "stripeApiCallError",
        operation: "get_account_info",
        account_id: accountId,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        error_type: error instanceof Stripe.errors.StripeError ? error.type : "Unknown",
        error_code: error instanceof Stripe.errors.StripeError ? error.code : "Unknown",
        error_status_code:
          error instanceof Stripe.errors.StripeError ? error.statusCode : "Unknown",
        timestamp: new Date().toISOString(),
      });

      if (error instanceof StripeConnectError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw convertStripeError(error, {
          operation: "get_account_info",
          connectAccountId: accountId,
        });
      }

      throw new StripeConnectError(
        StripeConnectErrorType.ACCOUNT_RETRIEVAL_FAILED,
        "アカウント情報取得中に予期しないエラーが発生しました",
        error as Error,
        { accountId }
      );
    }
  }

  /**
   * ユーザーのStripe Connectアカウント情報を取得する
   */
  async getConnectAccountByUser(userId: string): Promise<StripeConnectAccount | null> {
    try {
      // ユーザーIDの形式チェック
      validateUserId(userId);

      const { data, error } = await this.supabase
        .from("stripe_connect_accounts")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw this.errorHandler.mapDatabaseError(error, "Connect Account取得");
      }

      if (!data) return null;
      return data as StripeConnectAccount;
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }

      throw new StripeConnectError(
        StripeConnectErrorType.DATABASE_ERROR,
        "Connect Account取得中に予期しないエラーが発生しました",
        error as Error,
        { userId }
      );
    }
  }

  /**
   * Stripe Connectアカウントのステータスを更新する
   */
  async updateAccountStatus(params: UpdateAccountStatusParams): Promise<void> {
    try {
      const {
        userId,
        status,
        chargesEnabled,
        payoutsEnabled,
        stripeAccountId,
        classificationMetadata,
        trigger = "manual",
      } = params;

      validateUserId(userId);

      if (stripeAccountId) {
        // オプションで指定された場合のみ形式検証
        validateStripeAccountId(stripeAccountId);
      }

      // 現在のステータスを取得（ステータス変更検知用）
      const { data: currentAccount } = await this.supabase
        .from("stripe_connect_accounts")
        .select("status, stripe_account_id")
        .eq("user_id", userId)
        .maybeSingle();

      const previousStatus = currentAccount?.status || null;
      const accountId = stripeAccountId || currentAccount?.stripe_account_id || "";

      const updateData: Database["public"]["Tables"]["stripe_connect_accounts"]["Update"] = {
        status: status,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        updated_at: new Date().toISOString(),
      };

      // Stripe Account IDが指定されている場合は更新
      if (stripeAccountId) {
        updateData.stripe_account_id = stripeAccountId;
      }

      const { data: updatedRows, error } = await this.supabase
        .from("stripe_connect_accounts")
        .update(updateData)
        .eq("user_id", userId)
        .select("user_id");

      if (error) {
        throw this.errorHandler.mapDatabaseError(error, "Connect Accountステータス更新");
      }

      // ステータス変更時の監査ログ記録
      if (updatedRows && updatedRows.length > 0 && previousStatus !== status) {
        // classificationMetadataが提供されている場合のみ詳細ログを記録
        if (classificationMetadata && accountId) {
          const { logStatusChange } = await import("./audit-logger");
          await logStatusChange({
            timestamp: new Date().toISOString(),
            user_id: userId,
            stripe_account_id: accountId,
            previous_status: previousStatus,
            new_status: status,
            trigger,
            classification_metadata: classificationMetadata,
          });
        } else {
          // フォールバック: 基本的な監査ログ
          const { logStripeConnect } = await import("@core/logging/system-logger");
          await logStripeConnect({
            action: "connect.status_change",
            message: `Stripe Connect account status changed from ${previousStatus} to ${status}`,
            user_id: userId,
            outcome: "success",
            metadata: {
              previous_status: previousStatus,
              new_status: status,
              trigger,
              charges_enabled: chargesEnabled,
              payouts_enabled: payoutsEnabled,
            },
          });
        }
      }

      // 該当行が存在せず更新件数0件の場合のフェイルセーフ
      if (!updatedRows || updatedRows.length === 0) {
        // Insertには stripe_account_id が必須
        if (!stripeAccountId) {
          throw new StripeConnectError(
            StripeConnectErrorType.VALIDATION_ERROR,
            "Connect Accountが存在しないため作成が必要ですが、stripeAccountId が指定されていません",
            undefined,
            { userId }
          );
        }

        // 挿入前に stripe_account_id の衝突検知（別ユーザに紐付いていないか）
        const conflictCheck = await this.supabase
          .from("stripe_connect_accounts")
          .select("user_id")
          .eq("stripe_account_id", stripeAccountId)
          .maybeSingle();

        if (conflictCheck && !conflictCheck.error && conflictCheck.data) {
          const ownerUserId = conflictCheck.data.user_id as string;
          if (ownerUserId !== userId) {
            throw new StripeConnectError(
              StripeConnectErrorType.VALIDATION_ERROR,
              "指定された Stripe アカウントは既に別のユーザーに紐付いています",
              undefined,
              { userId, ownerUserId, stripeAccountId }
            );
          }
        }

        // 競合に強くするためUPSERT（user_id基準）
        const { error: insertError } = await this.supabase.from("stripe_connect_accounts").upsert(
          {
            user_id: userId,
            stripe_account_id: stripeAccountId,
            status: status,
            charges_enabled: chargesEnabled,
            payouts_enabled: payoutsEnabled,
          },
          { onConflict: "user_id" }
        );

        if (insertError) {
          throw this.errorHandler.mapDatabaseError(
            insertError,
            "Connect Account作成（フェイルセーフ）"
          );
        }
      }
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }

      throw new StripeConnectError(
        StripeConnectErrorType.DATABASE_ERROR,
        "Connect Accountステータス更新中に予期しないエラーが発生しました",
        error as Error,
        { userId: params.userId }
      );
    }
  }

  /**
   * Stripe Connectアカウントのビジネスプロファイルを更新する
   */
  async updateBusinessProfile(
    params: UpdateBusinessProfileParams
  ): Promise<UpdateBusinessProfileResult> {
    try {
      const { accountId, businessProfile } = params;

      // アカウントIDの形式チェック
      validateStripeAccountId(accountId);

      // 更新するフィールドを特定
      const updateFields: string[] = [];
      const updateData: Partial<Stripe.AccountUpdateParams["business_profile"]> = {};

      if (businessProfile.url !== undefined) {
        updateData.url = businessProfile.url;
        updateFields.push("url");
      }

      if (businessProfile.product_description !== undefined) {
        updateData.product_description = businessProfile.product_description;
        updateFields.push("product_description");
      }

      if (businessProfile.mcc !== undefined) {
        updateData.mcc = businessProfile.mcc;
        updateFields.push("mcc");
      }

      if (updateFields.length === 0) {
        // 更新する項目がない場合は成功として扱う
        return {
          success: true,
          accountId,
          updatedFields: [],
        };
      }

      // Stripe APIでビジネスプロファイルを更新
      const idempotencyKey = generateIdempotencyKey(`update-profile-${accountId}`);

      const stripe = this.getStripeClient();
      await stripe.accounts.update(
        accountId,
        {
          business_profile: updateData,
        },
        {
          idempotencyKey,
        }
      );

      logger.info("Business profile updated successfully", {
        tag: "updateBusinessProfile",
        account_id: accountId,
        updated_fields: updateFields,
      });

      return {
        success: true,
        accountId,
        updatedFields: updateFields,
      };
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }

      // Stripeエラーの場合は汎用ハンドラーで処理
      if (error && typeof error === "object" && "type" in error) {
        throw convertStripeError(error as Stripe.errors.StripeError, {
          operation: "update_business_profile",
          connectAccountId: params.accountId,
          additionalData: {
            updated_fields: Object.keys(params.businessProfile),
          },
        });
      }

      throw new StripeConnectError(
        StripeConnectErrorType.UNKNOWN_ERROR,
        "ビジネスプロファイル更新中に予期しないエラーが発生しました",
        error as Error,
        { accountId: params.accountId }
      );
    }
  }

  /**
   * アカウントが決済受取可能かチェックする
   */
  async isChargesEnabled(userId: string): Promise<boolean> {
    try {
      const account = await this.getConnectAccountByUser(userId);
      return account?.charges_enabled || false;
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }
      throw new StripeConnectError(
        StripeConnectErrorType.UNKNOWN_ERROR,
        "決済受取可能チェック中にエラーが発生しました",
        error as Error,
        { userId }
      );
    }
  }

  /**
   * アカウントが送金可能かチェックする
   */
  async isPayoutsEnabled(userId: string): Promise<boolean> {
    try {
      const account = await this.getConnectAccountByUser(userId);
      return account?.payouts_enabled || false;
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }
      throw new StripeConnectError(
        StripeConnectErrorType.UNKNOWN_ERROR,
        "送金可能チェック中にエラーが発生しました",
        error as Error,
        { userId }
      );
    }
  }

  /**
   * アカウントの認証状態をチェックする
   */
  async isAccountVerified(userId: string): Promise<boolean> {
    try {
      const account = await this.getConnectAccountByUser(userId);
      return account?.status === "verified";
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }
      throw new StripeConnectError(
        StripeConnectErrorType.UNKNOWN_ERROR,
        "アカウント認証状態チェック中にエラーが発生しました",
        error as Error,
        { userId }
      );
    }
  }

  /**
   * アカウントが送金実行に必要な全条件を満たしているかチェックする
   *   - status === 'verified'
   *   - payouts_enabled === true
   *
   * 注意: destination chargesを使用するため、charges_enabledは不要
   * （プラットフォームが決済処理を行うため）
   */
  async isAccountReadyForPayout(userId: string): Promise<boolean> {
    try {
      const account = await this.getConnectAccountByUser(userId);
      if (!account) return false;
      const payouts = account.payouts_enabled ?? false;
      return account.status === "verified" && payouts;
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }
      throw new StripeConnectError(
        StripeConnectErrorType.UNKNOWN_ERROR,
        "送金実行条件チェック中にエラーが発生しました",
        error as Error,
        { userId }
      );
    }
  }

  /**
   * Express Dashboard ログインリンクを生成する
   * Stripeのベストプラクティスに従い、オンデマンドでログインリンクを生成
   * @param accountId Stripe Connect Account ID
   * @returns ログインリンク情報
   * @throws StripeConnectError ログインリンク生成に失敗した場合
   */
  async createLoginLink(accountId: string): Promise<{ url: string; created: number }> {
    try {
      // Stripe Account IDの形式チェック
      validateStripeAccountId(accountId);

      // Stripeからログインリンクを生成
      const stripe = this.getStripeClient();
      const loginLink = await stripe.accounts.createLoginLink(accountId);

      logger.info("Login link created successfully", {
        tag: "stripeConnectLoginLinkCreated",
        account_id: accountId,
        url_length: loginLink.url.length,
      });

      return {
        url: loginLink.url,
        created: loginLink.created,
      };
    } catch (error) {
      logger.error("Failed to create login link", {
        tag: "stripeConnectLoginLinkError",
        account_id: accountId,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });

      throw new StripeConnectError(
        StripeConnectErrorType.UNKNOWN_ERROR,
        "ログインリンクの生成に失敗しました",
        error as Error,
        { accountId }
      );
    }
  }

  /**
   * Stripe Connectアカウントの残高を取得する
   * @param accountId Stripe Connect Account ID
   * @returns 利用可能残高（JPY）- available + pending の合計
   */
  async getAccountBalance(accountId: string): Promise<number> {
    try {
      validateStripeAccountId(accountId);

      logger.info("Stripe Connect残高取得を開始", { accountId });

      // Stripe APIで残高を取得
      const stripe = this.getStripeClient();
      const balance = await stripe.balance.retrieve({
        stripeAccount: accountId,
      });

      // JPYの利用可能残高を取得（available + pending）
      const availableJpy = balance.available.find((b) => b.currency === "jpy");
      const pendingJpy = balance.pending.find((b) => b.currency === "jpy");

      const availableAmount = availableJpy ? availableJpy.amount : 0;
      const pendingAmount = pendingJpy ? pendingJpy.amount : 0;
      const totalAmount = availableAmount + pendingAmount;

      logger.info("Stripe Connect残高取得完了", {
        accountId,
        availableAmount,
        pendingAmount,
        totalAmount,
      });

      return totalAmount;
    } catch (error) {
      logger.error("Stripe Connect残高取得エラー", {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new StripeConnectError(
        StripeConnectErrorType.STRIPE_API_ERROR,
        "アカウント残高の取得に失敗しました",
        error as Error,
        { accountId }
      );
    }
  }
}
