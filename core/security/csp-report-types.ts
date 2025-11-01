/**
 * CSP (Content Security Policy) レポートの型定義
 * @see https://www.w3.org/TR/CSP3/#csp-violation-report
 */

/**
 * CSP違反レポートのルートオブジェクト
 * ブラウザが送信する形式
 */
export interface CSPViolationReport {
  /**
   * CSPレポート本体
   */
  "csp-report": CSPViolationReportDetails;
}

/**
 * CSP違反の詳細情報
 */
export interface CSPViolationReportDetails {
  /**
   * ブロックされたリソースのURI（違反したURI）
   */
  "blocked-uri"?: string;

  /**
   * 違反したディレクティブ名（例: "script-src"）
   */
  "violated-directive"?: string;

  /**
   * 実際に適用されたディレクティブ名（違反したディレクティブが継承元の場合）
   */
  "effective-directive"?: string;

  /**
   * オリジナルのポリシー（全文）
   */
  "original-policy"?: string;

  /**
   * 違反が発生したページのURI
   */
  "document-uri"?: string;

  /**
   * 違反が発生したリファラー（存在する場合）
   */
  referrer?: string;

  /**
   * 違反が発生したスクリプトの行番号（存在する場合）
   */
  "line-number"?: number;

  /**
   * 違反が発生したスクリプトの列番号（存在する場合）
   */
  "column-number"?: number;

  /**
   * 違反したスクリプトのソースコード（最初の40文字、存在する場合）
   */
  "source-file"?: string;

  /**
   * ステータスコード（HTTPステータスコード、存在する場合）
   */
  "status-code"?: number;

  /**
   * サンプル（違反したスクリプトの一部、存在する場合）
   */
  sample?: string;

  /**
   * 違反が発生したフレームの祖先（存在する場合）
   */
  disposition?: string;
}
