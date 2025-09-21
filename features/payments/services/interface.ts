/**
 * PaymentServiceのインターフェース定義
 */

import { PaymentError, ErrorHandlingResult } from "@core/types/payment-errors";

import {
  Payment,
  PaymentStatus,
  CreateStripeSessionParams,
  CreateStripeSessionResult,
  CreateCashPaymentParams,
  CreateCashPaymentResult,
  UpdatePaymentStatusParams,
} from "./types";

/**
 * 決済サービスのメインインターフェース
 */
export interface IPaymentService {
  /**
   * Stripe決済セッションを作成する
   * @param params 決済セッション作成パラメータ
   * @returns 決済セッションのURLとID
   * @throws PaymentError 決済セッション作成に失敗した場合
   */
  createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult>;

  /**
   * 現金決済レコードを作成する
   * @param params 現金決済作成パラメータ
   * @returns 作成された決済レコードのID
   * @throws PaymentError 決済レコード作成に失敗した場合
   */
  createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult>;

  /**
   * 決済ステータスを更新する
   * @param params 決済ステータス更新パラメータ
   * @throws PaymentError 決済ステータス更新に失敗した場合
   */
  updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void>;

  /**
   * 複数の決済ステータスを一括更新する（楽観的ロック対応）
   * @param updates 更新対象の決済リスト
   * @param userId 実行ユーザーID
   * @param notes 更新理由・備考
   * @returns 成功・失敗の詳細結果
   * @throws PaymentError 一括更新に失敗した場合
   */
  bulkUpdatePaymentStatus(
    updates: Array<{
      paymentId: string;
      status: PaymentStatus;
      expectedVersion: number;
    }>,
    userId: string,
    notes?: string
  ): Promise<{
    successCount: number;
    failureCount: number;
    failures: Array<{
      paymentId: string;
      error: string;
    }>;
  }>;

  /**
   * 参加記録IDから決済情報を取得する
   * @param attendanceId 参加記録ID
   * @returns 決済情報（存在しない場合はnull）
   * @throws PaymentError データベースアクセスに失敗した場合
   */
  getPaymentByAttendance(attendanceId: string): Promise<Payment | null>;

  /**
   * 決済IDから決済情報を取得する
   * @param paymentId 決済ID
   * @returns 決済情報（存在しない場合はnull）
   * @throws PaymentError データベースアクセスに失敗した場合
   */
  getPaymentById(paymentId: string): Promise<Payment | null>;

  /**
   * イベントの決済リストを取得する（主催者用）
   * @param eventId イベントID
   * @param userId ユーザーID（権限チェック用）
   * @returns 決済情報のリスト
   * @throws PaymentError データベースアクセスまたは権限チェックに失敗した場合
   */
  getPaymentsByEvent(eventId: string, userId: string): Promise<Payment[]>;

  /**
   * 決済レコードを削除する
   * @param paymentId 決済ID
   * @throws PaymentError 削除に失敗した場合
   */
  deletePayment(paymentId: string): Promise<void>;
}

/**
 * エラーハンドリングサービスのインターフェース
 */
export interface IPaymentErrorHandler {
  /**
   * 決済エラーを処理し、適切な対応を決定する
   * @param error 発生したエラー
   * @returns エラーハンドリング結果
   */
  handlePaymentError(error: PaymentError): Promise<ErrorHandlingResult>;

  /**
   * エラーをログに記録する
   * @param error 発生したエラー
   * @param context 追加のコンテキスト情報
   */
  logError(error: PaymentError, context?: Record<string, unknown>): Promise<void>;
}

/**
 * 決済データ検証サービスのインターフェース
 */
export interface IPaymentValidator {
  /**
   * Stripe決済セッション作成パラメータを検証する
   * @param params 検証対象のパラメータ
   * @throws PaymentError バリデーションに失敗した場合
   */
  validateCreateStripeSessionParams(
    params: CreateStripeSessionParams,
    userId: string
  ): Promise<void>;

  /**
   * 現金決済作成パラメータを検証する
   * @param params 検証対象のパラメータ
   * @throws PaymentError バリデーションに失敗した場合
   */
  validateCreateCashPaymentParams(params: CreateCashPaymentParams, userId: string): Promise<void>;

  /**
   * 決済ステータス更新パラメータを検証する
   * @param params 検証対象のパラメータ
   * @throws PaymentError バリデーションに失敗した場合
   */
  validateUpdatePaymentStatusParams(params: UpdatePaymentStatusParams): Promise<void>;

  /**
   * 参加記録の存在と権限を検証する
   * @param attendanceId 参加記録ID
   * @param userId ユーザーID（権限チェック用）
   * @throws PaymentError 検証に失敗した場合
   */
  validateAttendanceAccess(attendanceId: string, userId: string): Promise<void>;

  /**
   * 決済金額の妥当性を検証する
   * @param amount 決済金額
   * @throws PaymentError 金額が無効な場合
   */
  validatePaymentAmount(amount: number): Promise<void>;
}
