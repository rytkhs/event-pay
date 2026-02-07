# StripeConnectService

EventPayアプリケーション用のStripe Connect APIとの連携を行うサービスクラスです。

## 概要

StripeConnectServiceは以下の機能を提供します：

- Stripe Express Accountの作成
-（オンボーディング用URL）の生成
- アカウント情報の取得と管理
- アカウントステータスの更新
- 決済・送金機能の有効性チェック

## 使用方法

### サービスインスタンスの作成

```typescript
import { createAdminStripeConnectService } from "@features/stripe-connect/server";
import { AdminReason } from "@core/security/secure-client-factory.types";

const stripeConnectService = await createAdminStripeConnectService(
  AdminReason.PAYMENT_PROCESSING,
  "docs: stripe-connect service example"
);
```

### Express Accountの作成

```typescript
try {
  const result = await stripeConnectService.createExpressAccount({
    userId: "user-uuid",
    email: "user@example.com",
    country: "JP",
    businessType: "individual"
  });

  console.log("Account created:", result.accountId);
} catch (error) {
  if (error instanceof StripeConnectError) {
    console.error("Error type:", error.type);
    console.error("Error message:", error.message);
  }
}
```

### Account Linkの生成

```typescript
try {
  const accountLink = await stripeConnectService.createAccountLink({
    accountId: "acct_xxx",
    refreshUrl: "https://yourapp.com/connect/refresh",
    returnUrl: "https://yourapp.com/connect/return",
    type: "account_onboarding"
  });

  // ユーザーをオンボーディングURLにリダイレクト
  window.location.href = accountLink.url;
} catch (error) {
  console.error("Account link creation failed:", error);
}
```

### アカウント情報の取得

```typescript
try {
  const accountInfo = await stripeConnectService.getAccountInfo("acct_xxx");

  console.log("Account status:", accountInfo.status);
  console.log("Charges enabled:", accountInfo.chargesEnabled);
  console.log("Payouts enabled:", accountInfo.payoutsEnabled);
} catch (error) {
  console.error("Failed to get account info:", error);
}
```

### ユーザーのConnect Account取得

```typescript
try {
  const connectAccount = await stripeConnectService.getConnectAccountByUser("user-uuid");

  if (connectAccount) {
    console.log("User has Connect account:", connectAccount.stripe_account_id);
  } else {
    console.log("User does not have Connect account");
  }
} catch (error) {
  console.error("Failed to get user's Connect account:", error);
}
```

### アカウント機能のチェック

```typescript
try {
  const userId = "user-uuid";

  const canReceivePayments = await stripeConnectService.isChargesEnabled(userId);
  const canReceivePayouts = await stripeConnectService.isPayoutsEnabled(userId);
  const isVerified = await stripeConnectService.isAccountVerified(userId);

  console.log("Can receive payments:", canReceivePayments);
  console.log("Can receive payouts:", canReceivePayouts);
  console.log("Account verified:", isVerified);
} catch (error) {
  console.error("Failed to check account capabilities:", error);
}
```

## エラーハンドリング

StripeConnectServiceは`StripeConnectError`クラスを使用してエラーを管理します。

```typescript
import { StripeConnectError, StripeConnectErrorType } from "@features/stripe-connect/types";

try {
  await stripeConnectService.createExpressAccount(params);
} catch (error) {
  if (error instanceof StripeConnectError) {
    switch (error.type) {
      case StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS:
        // 既存アカウントがある場合の処理
        break;
      case StripeConnectErrorType.VALIDATION_ERROR:
        // バリデーションエラーの処理
        break;
      case StripeConnectErrorType.STRIPE_API_ERROR:
        // Stripe APIエラーの処理
        break;
      default:
        // その他のエラーの処理
        break;
    }
  }
}
```

## エラータイプ

- `ACCOUNT_ALREADY_EXISTS`: 既にアカウントが存在する
- `ACCOUNT_NOT_FOUND`: アカウントが見つからない
- `INVALID_ACCOUNT_STATUS`: アカウントの状態が無効
- `ONBOARDING_INCOMPLETE`: オンボーディングが未完了
- `STRIPE_API_ERROR`: Stripe APIエラー
- `ACCOUNT_CREATION_FAILED`: アカウント作成失敗
- `ACCOUNT_LINK_CREATION_FAILED`: Account Link生成失敗
- `ACCOUNT_RETRIEVAL_FAILED`: アカウント情報取得失敗
- `DATABASE_ERROR`: データベースエラー
- `VALIDATION_ERROR`: バリデーションエラー
- `UNKNOWN_ERROR`: 不明なエラー

## 注意事項

1. **環境変数**: 以下の環境変数が必要です
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`

2. **権限**: Supabase Service Role Keyを使用するため、サーバーサイドでのみ使用してください

3. **レート制限**: Stripe APIのレート制限に注意してください

4. **エラーログ**: エラーは自動的にログ出力されます

## テスト

```bash
# 単体テスト
npm test -- --testPathPattern="stripe-connect/service.test.ts"

# 統合テスト（環境変数が設定されている場合のみ）
npm test -- --testPathPattern="stripe-connect/integration.test.ts"
```
