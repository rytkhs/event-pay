/**
 * StripeConnectServiceのインターフェース定義
 */

import type { PostgrestError } from "@supabase/supabase-js";

import {
  StripeConnectAccount,
  CreateExpressAccountParams,
  CreateExpressAccountResult,
  CreateAccountLinkParams,
  CreateAccountLinkResult,
  AccountInfo,
  UpdateAccountStatusParams,
  StripeConnectError,
  ErrorHandlingResult,
} from "./types";

/**
 * Stripe Connect サービスのメインインターフェース
 */
export interface IStripeConnectService {
  /**
   * Stripe Express Accountを作成する
   * @param params Express Account作成パラメータ
   * @returns 作成されたアカウントIDとステータス
   * @throws StripeConnectError アカウント作成に失敗した場合
   */
  createExpressAccount(params: CreateExpressAccountParams): Promise<CreateExpressAccountResult>;

  /**
   * Account Linkを生成する（オンボーディング用）
   * @param params Account Link生成パラメータ
   * @returns 生成されたAccount LinkのURLと有効期限
   * @throws StripeConnectError Account Link生成に失敗した場合
   */
  createAccountLink(params: CreateAccountLinkParams): Promise<CreateAccountLinkResult>;

  /**
   * Stripe Connectアカウント情報を取得する
   * @param accountId Stripe Connect アカウントID
   * @returns アカウント情報
   * @throws StripeConnectError アカウント情報取得に失敗した場合
   */
  getAccountInfo(accountId: string): Promise<AccountInfo>;

  /**
   * ユーザーのStripe Connectアカウント情報を取得する
   * @param userId ユーザーID
   * @returns Stripe Connectアカウント情報（存在しない場合はnull）
   * @throws StripeConnectError データベースアクセスに失敗した場合
   */
  getConnectAccountByUser(userId: string): Promise<StripeConnectAccount | null>;

  /**
   * Stripe Connectアカウントのステータスを更新する
   * @param params アカウントステータス更新パラメータ
   * @throws StripeConnectError ステータス更新に失敗した場合
   */
  updateAccountStatus(params: UpdateAccountStatusParams): Promise<void>;

  /**
   * アカウントが決済受取可能かチェックする
   * @param userId ユーザーID
   * @returns 決済受取可能かどうか
   * @throws StripeConnectError アカウント情報取得に失敗した場合
   */
  isChargesEnabled(userId: string): Promise<boolean>;

  /**
   * アカウントが送金可能かチェックする
   * @param userId ユーザーID
   * @returns 送金可能かどうか
   * @throws StripeConnectError アカウント情報取得に失敗した場合
   */
  isPayoutsEnabled(userId: string): Promise<boolean>;

  /**
   * アカウントが送金実行に必要な全条件（verified / charges_enabled / payouts_enabled）を満たしているか
   * @param userId ユーザーID
   */
  isAccountReadyForPayout(userId: string): Promise<boolean>;

  /**
   * アカウントの認証状態をチェックする
   * @param userId ユーザーID
   * @returns 認証完了かどうか
   * @throws StripeConnectError アカウント情報取得に失敗した場合
   */
  isAccountVerified(userId: string): Promise<boolean>;

  /**
   * Express Dashboard ログインリンクを生成する
   * @param accountId Stripe Connect Account ID
   * @returns ログインリンク情報
   * @throws StripeConnectError ログインリンク生成に失敗した場合
   */
  createLoginLink(accountId: string): Promise<{ url: string; created: number }>;
}

/**
 * StripeConnect エラーハンドラーのインターフェース
 */
export interface IStripeConnectErrorHandler {
  /**
   * StripeConnectエラーを処理する
   * @param error StripeConnectError
   * @returns エラーハンドリング結果
   */
  handleError(error: StripeConnectError): Promise<ErrorHandlingResult>;

  /**
   * Stripe APIエラーをStripeConnectErrorにマッピングする
   * @param stripeError Stripe APIエラー
   * @param context エラーが発生したコンテキスト
   * @returns StripeConnectError
   */
  mapStripeError(stripeError: Error, context: string): StripeConnectError;

  /**
   * データベースエラーをStripeConnectErrorにマッピングする
   * @param dbError データベースエラー
   * @param context エラーが発生したコンテキスト
   * @returns StripeConnectError
   */
  mapDatabaseError(dbError: Error | PostgrestError, context: string): StripeConnectError;
}
