# React Email テンプレート

このディレクトリには、React Emailを使用したメールテンプレートが格納されています。

## 構成

```
emails/
├── _components/       # 共通コンポーネント（Button, Section, Divider等）
├── _layout/          # 共通レイアウト（EmailLayout）
├── connect/          # Stripe Connect関連通知
│   ├── AccountVerifiedEmail.tsx
│   ├── AccountRestrictedEmail.tsx
│   └── AccountStatusChangedEmail.tsx
├── admin/            # 管理者向け通知
│   └── AdminAlertEmail.tsx
└── README.md
```

## 開発

### プレビュー

React Emailのローカルプレビューサーバーを起動します：

```bash
npm run email:dev
```

ブラウザで http://localhost:3000 を開くと、全てのテンプレートをプレビューできます。

### 新規テンプレート作成

1. 適切なディレクトリに `.tsx` ファイルを作成
2. `EmailLayout` をインポートして使用
3. Props インターフェースをエクスポート
4. デフォルトエクスポートでコンポーネントをエクスポート

例：

```tsx
import { Heading, Text } from "@react-email/components";
import * as React from "react";

import { EmailLayout } from "../_layout/EmailLayout";

export interface MyEmailProps {
  userName: string;
}

export const MyEmail = ({ userName }: MyEmailProps) => {
  return (
    <EmailLayout preheader="プレヘッダーテキスト">
      <Heading>タイトル</Heading>
      <Text>{userName} 様</Text>
    </EmailLayout>
  );
};

export default MyEmail;
```

### 使用方法（サーバー側）

```typescript
import * as React from "react";

// Dynamic import推奨
const { default: MyEmail } = await import("@/emails/path/to/MyEmail");

const template: EmailTemplate = {
  subject: "件名",
  react: React.createElement(MyEmail, {
    userName: "山田太郎",
  }),
};

await emailService.sendEmail({
  to: "user@example.com",
  template,
});
```

## 注意事項

- JSXは使用せず、`React.createElement` を使用してください（サーバーサイドでの動的インポート対応）
- スタイルはインラインスタイルとして記述してください
- メールクライアントの互換性を考慮し、複雑なCSSは避けてください
- 画像は外部URLで指定してください（埋め込みは非推奨）
- プレヘッダーテキストは50-100文字程度に収めてください

## リリース済みテンプレート

- ✅ AccountVerifiedEmail - Stripe Connect アカウント認証完了
- ✅ AccountRestrictedEmail - Stripe Connect アカウント制限
- ✅ AccountStatusChangedEmail - Stripe Connect アカウント状態変更
- ✅ AdminAlertEmail - 管理者向けアラート

## Phase 2（未実装）

- EventCancelledEmail - イベント中止通知
- PaymentReminderEmail - 決済期限超過リマインダー
- EventReminderEmail - イベント開催リマインダー
- EventUpdatedEmail - イベント情報変更通知
