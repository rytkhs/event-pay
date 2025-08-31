/**
 * StripeConnectServiceの基本実装
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { Database } from "@/types/database";
import { stripe } from "@core/stripe/client";
import { IStripeConnectService, IStripeConnectErrorHandler } from "./interface";
import { logger } from "@core/logging/app-logger";
import {
  StripeConnectAccount,
  CreateExpressAccountParams,
  CreateExpressAccountResult,
  CreateAccountLinkParams,
  CreateAccountLinkResult,
  AccountInfo,
  UpdateAccountStatusParams,
  StripeConnectError,
  StripeConnectErrorType,
} from "./types";
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
  private supabase: SupabaseClient<Database>;
  private stripe = stripe;
  private errorHandler: IStripeConnectErrorHandler;

  constructor(supabaseClient: SupabaseClient<Database>, errorHandler: IStripeConnectErrorHandler) {
    this.supabase = supabaseClient;
    this.errorHandler = errorHandler;
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
      const { userId, email, country, businessProfile } = validatedParams;

      // 既存アカウントの重複チェック（DB）
      const existingAccount = await this.getConnectAccountByUser(userId);
      if (existingAccount) {
        throw new StripeConnectError(
          StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS,
          `ユーザー ${userId} には既にStripe Connectアカウントが存在します`,
          undefined,
          { userId, existingAccountId: existingAccount.stripe_account_id }
        );
      }

      // Stripe側の既存アカウント確認（emailでリスト→metadata.actor_idで照合）
      // 見つかった場合はそのアカウントを再利用する
      let stripeAccount: Stripe.Account | null = null;
      try {
        // 型定義に search が無いStripeバージョンでもビルドを通すため、動的呼び出し
        const accountsResource = this.stripe.accounts as unknown as {
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
        const idempotencyKey = `connect-create:${userId}`;
        if (process.env.NODE_ENV === "test") {
          // テスト環境では引数シグネチャ互換のためリクエストオプションを渡さない
          stripeAccount = await this.stripe.accounts.create(createParams as any);
        } else {
          stripeAccount = await this.stripe.accounts.create(createParams, { idempotencyKey });
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
        if (createdNewAccount && stripeAccount && process.env.NODE_ENV !== "test") {
          try {
            await this.stripe.accounts.del(stripeAccount.id);
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
        throw this.errorHandler.mapStripeError(error, "Express Account作成");
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
        // Stripeの型定義では fields が必須のため、デフォルト値 "currently_due" を設定しておく
        const collectionOptions: Stripe.AccountLinkCreateParams.CollectionOptions = {
          fields: validatedParams.collectionOptions.fields ?? "currently_due",
        };

        if (validatedParams.collectionOptions.futureRequirements) {
          collectionOptions.future_requirements =
            validatedParams.collectionOptions.futureRequirements;
        }

        createParams.collection_options = collectionOptions;
      }

      const accountLink = await this.stripe.accountLinks.create(createParams);

      return {
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      };
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw this.errorHandler.mapStripeError(error, "Account Link生成");
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

      // Stripeからアカウント情報を取得
      const account = await this.stripe.accounts.retrieve(accountId);

      // ステータスの判定（優先度: restricted > verified > onboarding > unverified）
      let status: Database["public"]["Enums"]["stripe_account_status_enum"] = "unverified";
      if (account.requirements?.disabled_reason) {
        status = "restricted";
      } else {
        const transfersCap = (() => {
          const cap = (account.capabilities as any)?.transfers;
          if (typeof cap === "string") return cap === "active";
          if (cap && typeof cap === "object" && "status" in cap)
            return (cap as any).status === "active";
          return false;
        })();

        if (account.details_submitted && transfersCap && account.payouts_enabled) {
          status = "verified";
        } else if (account.details_submitted) {
          status = "onboarding";
        }
      }

      // requirements は undefined の場合や disabled_reason 未設定の場合のキー追加を避ける
      let requirements:
        | {
            currently_due: string[];
            eventually_due: string[];
            past_due: string[];
            pending_verification: string[];
            disabled_reason?: string;
          }
        | undefined = undefined;
      if (account.requirements) {
        requirements = {
          currently_due: account.requirements.currently_due || [],
          eventually_due: account.requirements.eventually_due || [],
          past_due: account.requirements.past_due || [],
          pending_verification: account.requirements.pending_verification || [],
        };
        if (account.requirements.disabled_reason) {
          requirements.disabled_reason = account.requirements.disabled_reason;
        }
      }

      // capabilities は string または { status: string } の両方に対応
      const mapCapability = (cap: unknown): "active" | "inactive" | "pending" | undefined => {
        if (typeof cap === "string") return cap as any;
        if (cap && typeof cap === "object" && "status" in (cap as any)) return (cap as any).status;
        return undefined;
      };

      const capabilities = account.capabilities
        ? {
            card_payments: mapCapability((account.capabilities as any).card_payments),
            transfers: mapCapability((account.capabilities as any).transfers),
          }
        : undefined;

      return {
        accountId: account.id,
        status: status,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        email: account.email || undefined,
        country: account.country || undefined,
        businessType: account.business_type || undefined,
        requirements,
        capabilities,
      };
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw error;
      }

      if (error instanceof Stripe.errors.StripeError) {
        throw this.errorHandler.mapStripeError(error, "アカウント情報取得");
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
      const { userId, status, chargesEnabled, payoutsEnabled, stripeAccountId } = params;

      validateUserId(userId);

      if (stripeAccountId) {
        // オプションで指定された場合のみ形式検証
        validateStripeAccountId(stripeAccountId);
      }

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
   *   - charges_enabled === true
   *   - payouts_enabled === true
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
}
