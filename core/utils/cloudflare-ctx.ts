/**
 * Cloudflare Workers Context ヘルパー
 *
 * waitUntilを安全に呼び出すためのユーティリティ
 * - Workers環境: ctx.waitUntil()でバックグラウンド実行
 * - ローカル開発環境: Contextがない場合はawaitして完了させる
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare WorkersのwaitUntilを使ってバックグラウンド処理を実行する
 *
 * @param promise バックグラウンドで実行するPromise
 *
 * **使い方**:
 * ```typescript
 * // レスポンス後もログ保存を継続
 * waitUntil(saveLogToDatabase());
 * ```
 *
 * **動作**:
 * - Workers環境: レスポンス返却後もPromiseの完了を待機
 * - ローカル開発環境: その場でawaitして確実に完了させる
 */
export async function waitUntil(promise: Promise<unknown>): Promise<void> {
  try {
    // OpenNextからCloudflare Contextを取得
    const { ctx } = await getCloudflareContext();

    // Workers環境: レスポンス後まで処理を待機させる
    ctx.waitUntil(promise);
  } catch (error) {
    // ローカル開発環境やビルド時など、Contextが取得できない場合
    if (process.env.NODE_ENV === "development") {
      // 開発環境: awaitして確実に完了させる（ログ欠損を防ぐ）
      // eslint-disable-next-line no-console
      console.log("[Dev:waitUntil] Context not found, awaiting promise...");
      // eslint-disable-next-line no-console
      await promise.catch((e) => console.error("[Dev:waitUntil] Error:", e));
    } else {
      // 本番で万が一Contextが取れない場合は、Fire-and-Forget
      // エラーログは出すが、処理は続行する
      // eslint-disable-next-line no-console
      promise.catch((e) => console.error("[waitUntil] Fallback error:", e));
    }
  }
}
