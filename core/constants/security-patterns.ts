/**
 * セキュリティ関連の悪意パターン定義
 * 入力サニタイゼーション監査で使用する検査パターン
 */

/**
 * 悪意のある入力パターンを検出するための正規表現集
 */
const MALICIOUS_INPUT_PATTERNS = [
  // HTMLスクリプトタグ
  /<script[^>]*>/i,

  // JavaScriptプロトコル
  /javascript:/i,

  // データURIによるHTML
  /data:text\/html/i,

  // VBScriptプロトコル
  /vbscript:/i,

  // HTMLイベントハンドラ
  /on\w+\s*=/i,

  // Base64エンコードされたスクリプト（一般的なパターン）
  /data:application\/javascript/i,

  // その他の危険なプロトコル
  /file:/i,
] as const;

/**
 * 検出された悪意パターンの詳細情報を取得します
 * @param input 検査対象の入力文字列
 * @returns 検出されたパターンの詳細情報
 */
export function getMaliciousPatternDetails(input: string): {
  hasPattern: boolean;
  detectedPatterns: string[];
} {
  const detectedPatterns: string[] = [];

  MALICIOUS_INPUT_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(input)) {
      // パターンの説明を追加
      const patternDescriptions = [
        "script_tag",
        "javascript_protocol",
        "data_html",
        "vbscript_protocol",
        "event_handler",
        "data_javascript",
        "file_protocol",
      ];
      detectedPatterns.push(patternDescriptions[index]);
    }
  });

  return {
    hasPattern: detectedPatterns.length > 0,
    detectedPatterns,
  };
}
