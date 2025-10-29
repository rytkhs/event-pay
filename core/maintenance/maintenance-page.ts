/**
 * メンテナンスページ HTML 生成
 * 503 Service Unavailable 用の固定HTMLを返す
 */

export function getMaintenancePageHTML(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>メンテナンス中 - みんなの集金</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #333;
    }
    .container {
      background: white;
      border-radius: 12px;
      padding: 48px 32px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
      text-align: center;
    }
    h1 {
      font-size: 32px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #1a1a1a;
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: #666;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: #999;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔧</div>
    <h1>メンテナンス中</h1>
    <p>現在、システムのメンテナンスを実施しております。</p>
    <p>しばらくしてから再度アクセスしてください。</p>
    <p class="subtitle">ご不便をおかけして申し訳ございません。</p>
  </div>
</body>
</html>`;
}

/**
 * メンテナンスモードのチェック
 * @param pathname リクエストパス
 * @param searchParams URL の検索パラメータ
 * @param maintenanceMode メンテナンスモードが有効か
 * @param bypassToken バイパストークン
 * @returns メンテナンスモードを適用するか
 */
export function shouldShowMaintenancePage(
  pathname: string,
  searchParams: URLSearchParams,
  maintenanceMode: string | undefined,
  bypassToken: string | undefined
): boolean {
  // メンテナンスモードが無効の場合は通常表示
  if (maintenanceMode !== "true") {
    return false;
  }

  // バイパストークンが設定されていて、URLパラメータと一致する場合はバイパス
  if (bypassToken) {
    const bypassParam = searchParams.get("bypass");
    if (bypassParam === bypassToken) {
      return false;
    }
  }

  // Webhook エンドポイントは常にアクセス可能
  if (pathname.startsWith("/api/webhooks/")) {
    return false;
  }

  // その他のパスはメンテナンスページを表示
  return true;
}
