## 🗂️ **推奨ディレクトリ構造**

```
public/
├── images/
│   ├── marketing/           # LP用画像
│   │   ├── hero/           # ヒーロー画像
│   │   │   └── mobile-flow-demo.png
│   │   ├── features/       # 機能紹介画像
│   │   │   ├── sns-sharing.png
│   │   │   ├── dashboard-overview.png
│   │   │   └── notification-settings.png
│   │   ├── problems/       # 問題提起用イラスト
│   │   │   ├── line-chaos.png
│   │   │   ├── cash-burden.png
│   │   │   ├── manual-reminder.png
│   │   │   └── payment-unclear.png
│   │   └── use-cases/      # ユースケース画像
│   │       ├── circle-activities.png
│   │       ├── pta-community.png
│   │       ├── sports-team.png
│   │       └── company-events.png
│   ├── icons/              # アイコン類
│   └── logos/              # ロゴファイル
└── favicon.ico             # ファビコン
```

## 📝 **実装手順**

[4 tools called]

## ✅ **ディレクトリ作成完了**

画像配置用のディレクトリ構造を作成しました！

## 🖼️ **配置する画像ファイル**

### **📸 スクリーンショット系（機能説明用）**
```
public/images/marketing/hero/
└── mobile-flow-demo.png        # スマホでの参加→決済フロー

public/images/marketing/features/
├── sns-sharing.png             # SNSでの招待リンク共有
├── dashboard-overview.png      # 管理ダッシュボード画面
└── notification-settings.png   # 自動通知設定画面
```

### **🎨 イラスト・写真系（共感・ユースケース用）**
```
public/images/marketing/problems/
├── line-chaos.png              # LINEの返信が散らばる
├── cash-burden.png             # 現金回収が負担
├── manual-reminder.png         # リマインドが手作業
└── payment-unclear.png         # 入金状況が不透明

public/images/marketing/use-cases/
├── circle-activities.png       # サークル活動
├── pta-community.png          # PTA・町内会
├── sports-team.png            # スポーツチーム
└── company-events.png         # 社内イベント
```

## 🔧 **ランディングページでの使用方法**

ランディングページで以下のように変更します：

```tsx
// ❌ 現在（外部URL）
<Image
  src="https://user-gen-media-assets.s3.amazonaws.com/gpt4o_images/..."
  alt="スマホ画面での参加表明から決済、自動集計の流れ"
  width={1200}
  height={800}
  unoptimized
/>

// ✅ 変更後（ローカルファイル）
<Image
  src="/images/marketing/hero/mobile-flow-demo.png"
  alt="スマホ画面での参加表明から決済、自動集計の流れ"
  width={1200}
  height={800}
  priority // ヒーロー画像なのでpriorityを設定
/>
```

## 📋 **作業の進め方**

1. **スクリーンショット撮影**
   - アプリの該当画面をキャプチャ
   - 適切なサイズにリサイズ（幅1200px程度推奨）

2. **イラスト・写真準備**
   - フリー素材サイトから取得
   - または既存のプレースホルダーを整理して保存

3. **ファイル配置**
   - 上記ディレクトリに保存

4. **コード修正**
   - LandingPage.tsxの画像URLを変更

これで、外部URLへの依存がなくなり、画像の管理も簡潔になります！
