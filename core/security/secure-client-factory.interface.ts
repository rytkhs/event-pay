import { GuestValidationResult, GuestSession } from "./secure-client-factory.types";

/**
 * ゲストトークンバリデーターのインターフェース
 *
 * RLSポリシーベースのトークン検証を提供し、
 * 管理者権限を使用しない安全なアクセス制御を実現します。
 */
export interface IGuestTokenValidator {
  /**
   * ゲストトークンを検証
   *
   * RLSポリシーを使用してトークンの有効性を確認し、
   * 関連する参加情報とイベント情報を取得します。
   *
   * @param token ゲストトークン
   * @returns 検証結果
   */
  validateToken(token: string): Promise<GuestValidationResult>;

  /**
   * ゲストセッションを作成
   *
   * 検証済みのトークンからゲストセッション情報を作成します。
   *
   * @param token ゲストトークン
   * @returns ゲストセッション情報
   */
  createGuestSession(token: string): Promise<GuestSession>;

  /**
   * 変更権限をチェック
   *
   * イベントの開始時刻と登録締切を確認し、
   * ゲストが参加情報を変更可能かどうかを判定します。
   *
   * @param token ゲストトークン
   * @returns 変更可能かどうか
   */
  checkModificationPermissions(token: string): Promise<boolean>;

  /**
   * トークンの基本フォーマットを検証
   *
   * トークンの長さと文字種をチェックします。
   *
   * @param token ゲストトークン
   * @returns フォーマットが有効かどうか
   */
  validateTokenFormat(token: string): boolean;
}
