# React Email テンプレート

このディレクトリには、React Emailを使用したメールテンプレートが格納されています。

## 構成

```
emails/
├── _components/       # 共通コンポーネント
│   ├── Button.tsx          # CTAボタン（primary/secondary）
│   ├── Section.tsx         # カラフルなセクションカード（5種類のvariant）
│   ├── Divider.tsx         # 区切り線
│   ├── StatusBadge.tsx     # ステータスバッジ（enabled/disabled）
│   └── InfoCard.tsx        # 情報カード（アイコン付き）
├── _layout/          # 共通レイアウト
│   └── EmailLayout.tsx     # グラデーションヘッダー付きレイアウト
├── connect/          # Stripe Connect関連通知
│   ├── AccountVerifiedEmail.tsx
│   ├── AccountRestrictedEmail.tsx
│   └── AccountStatusChangedEmail.tsx
├── participation/    # イベント参加関連
│   └── ParticipationRegisteredEmail.tsx
├── payment/          # 決済関連
│   └── PaymentCompletedEmail.tsx
├── admin/            # 管理者向け通知
│   └── AdminAlertEmail.tsx
└── README.md
```

## デザインシステム

### カラーパレット

- **ブランドカラー**: グラデーション（#667eea → #764ba2）
- **Success**: #22c55e (緑)
- **Warning**: #eab308 (黄)
- **Danger**: #ef4444 (赤)
- **Info**: #3b82f6 (青)
- **グレースケール**: slate系（#1e293b → #f8fafc）

### タイポグラフィ

- **見出し（H1）**: 28px / 700 weight
- **見出し（H2）**: 20px / 600 weight
- **本文**: 16px / 400 weight
- **キャプション**: 14px / 400 weight
- **フォント**: システムフォント + 日本語フォント

### コンポーネント仕様

#### EmailLayout
- グラデーションヘッダー（紫系）
- 白い背景のカード型デザイン
- シャドウとボーダーラディウスで立体感
- グレーのフッターエリア

#### Button
- 2種類のバリアント（primary/secondary）
- パディング: 14px 32px
- ボーダーラディウス: 8px
- センター配置オプション

#### Section
- 5種類のバリアント（default, info, warning, success, danger）
- 左側に6pxのアクセントボーダー
- 各バリアントで異なる背景色とボーダー色
- 内側のパディング: 20px 24px

#### InfoCard
- ラベルと値を表示するカード
- アイコン付き（絵文字対応）
- ライトグレーの背景
- 大文字のラベル（uppercase + letter-spacing）

#### StatusBadge
- ピルシェイプのバッジ
- enabled/disabledの2状態
- 背景色、テキスト色、ボーダー色が連動

### デザイン改善のポイント

1. **視覚的階層の明確化**: 大きめの見出し、適切なスペーシング
2. **ブランドアイデンティティ**: グラデーションヘッダーで統一感
3. **カラフルなフィードバック**: Section variantで状況を一目で理解
4. **アイコンの活用**: 絵文字で視認性と親しみやすさを向上
5. **モダンなUI**: 角丸、シャドウ、適切なパディング
6. **日本語対応**: 日本語フォントの優先順位を考慮

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
