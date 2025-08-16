/**
 * 決済サービス関連の機能フラグ
 */

/**
 * Destination charges機能フラグ
 * 環境変数 USE_DESTINATION_CHARGES で制御
 * - "true": Destination chargesを使用
 * - "false" または未設定: 従来のSeparate charges and transfersを使用
 */
export function useDestinationCharges(): boolean {
  const envValue = process.env.USE_DESTINATION_CHARGES;
  return envValue === "true";
}

/**
 * 機能フラグの状態をログ出力用に取得
 */
export function getFeatureFlagStatus() {
  return {
    useDestinationCharges: useDestinationCharges(),
  };
}
